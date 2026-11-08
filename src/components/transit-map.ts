/*
  The live transit map at /transit/ (TransitMap.astro holds the markup and styles).

  Three layers of data:
  - routes and stops: static files built weekly by scripts/build-transit.ts
    (public/transit/), loaded once;
  - vehicles: /transit/api/vehicles.json (src/lib/transit.ts), polled every 15 seconds
    while the tab is visible;
  - the basemap: OpenFreeMap vector tiles (free, no key), light or dark to match the site.
*/
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ICONS, type IconMode } from './transit-icons';
import { POWER_WORDS, VESSELS, busSvg, ferrySvg, kcmBus } from './transit-vehicles';

type Mode = 'bus' | 'rail' | 'tram' | 'ferry' | 'other';
type RouteRow = [agency: number, id: string, short: string, long: string, color: string, mode: Mode];
interface Meta {
  updated: string;
  systems: { key: string; name: string; live: boolean; credit?: string }[];
  agencies: [system: number, name: string, website?: string][];
  routes: RouteRow[];
}
type StopRow = [lon: number, lat: number, name: string, routes: number[], system: number, id: string];
type FeedStatus = [key: string, ok: boolean, vehicles: number, age: number | null, error: string | null];
type VehicleRow = [feed: number, id: string, lon: number, lat: number, bearing: number | null, route: string, label: string, ts: number, speed: number | null, status: number | null, stop: string];
interface Live {
  t: number;
  feeds: FeedStatus[];
  v: VehicleRow[];
}

const DATA = '/transit';
const POLL_MS = 15_000;
const GLIDE_MS = 280;
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const MODE_COLORS: Record<Mode, string> = { bus: '#2f6fdf', rail: '#7048e8', tram: '#0c8a6a', ferry: '#1098ad', other: '#868e96' };
// Distinct line colors for agencies that paint every route the same (King County Metro's
// buses are all yellow): mid-tones that hold up on both the light and the dark basemap.
const DISTINCT = ['#2f6fdf', '#d6336c', '#0c8a6a', '#e8590c', '#7048e8', '#1098ad', '#c92a2a', '#5c940d', '#ae3ec9', '#e67700', '#1864ab', '#087f5b', '#a61e4d', '#4c6ef5'];
const MODE_RANK: Record<Mode, number> = { bus: 0, other: 0, ferry: 1, tram: 2, rail: 3 };
const MODE_NAMES: Record<Mode, string> = { bus: 'Bus', rail: 'Train', tram: 'Light rail or streetcar', ferry: 'Ferry', other: 'Other' };
const STATUS_WORDS = ['Arriving at', 'Stopped at', 'Heading to'];

export const REGIONS: Record<string, { bounds: [number, number, number, number] }> = {
  state: { bounds: [-124.8, 45.5, -116.9, 49.05] },
  puget: { bounds: [-122.75, 47.15, -121.95, 47.95] },
  seattle: { bounds: [-122.44, 47.52, -122.24, 47.7] },
  spokane: { bounds: [-117.6, 47.55, -117.2, 47.78] },
  tricities: { bounds: [-119.45, 46.15, -119.05, 46.35] },
  vancouver: { bounds: [-122.75, 45.58, -122.45, 45.75] },
  bellingham: { bounds: [-122.6, 48.68, -122.38, 48.82] },
  olympia: { bounds: [-123.05, 46.97, -122.75, 47.1] },
};

const reducedMotion = () =>
  document.documentElement.dataset.motion === 'reduce' ||
  (document.documentElement.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);

const theme = (): 'light' | 'dark' => {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const ago = (seconds: number) => {
  if (seconds < 5) return 'just now';
  if (seconds < 90) return `${Math.round(seconds)} seconds ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes ago`;
  return `${Math.round(seconds / 3600)} hours ago`;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { style?: string } = {}, ...children: (Node | string | null)[]) {
  const node = document.createElement(tag);
  const { style, ...rest } = props;
  Object.assign(node, rest);
  if (style) node.setAttribute('style', style);
  for (const child of children) if (child !== null) node.append(child);
  return node;
}

/** Text that stays readable on a route-colored chip. */
function chipText(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#111111' : '#ffffff';
}

const ICON_MODES: IconMode[] = ['bus', 'tram', 'rail', 'ferry'];
const iconFor = (mode: Mode): IconMode => (mode === 'other' ? 'bus' : mode);

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}
const pixels = (ctx: CanvasRenderingContext2D, size: number) => ({ width: size, height: size, data: new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer) });

/** The vehicle marker with a heading: a circle with a nose, as an SDF so it can be tinted. */
function arrowImage(size = 64) {
  const [, ctx] = canvas(size);
  const c = size / 2;
  const r = size * 0.27;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c, size * 0.06);
  ctx.lineTo(c + r * 0.82, c - r * 0.45);
  ctx.lineTo(c - r * 0.82, c - r * 0.45);
  ctx.closePath();
  ctx.fill();
  return pixels(ctx, size);
}

/** A rounded chip behind route numbers on the lines (stretched to fit the text). */
function chipImage(size = 24) {
  const [, ctx] = canvas(size);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(2, 2, size - 4, size - 4, 6);
  ctx.fill();
  return pixels(ctx, size);
}

/** A mode icon in one color, drawn at 2x for sharp edges. */
function glyphImage(mode: IconMode, color: string, size = 48) {
  const [, ctx] = canvas(size);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(ICONS[mode]), 'evenodd');
  return pixels(ctx, size);
}

/** A station badge: rounded square in the map's background color, mode icon in its color. */
function stationImage(mode: IconMode, bg: string, border: string, size = 44) {
  const [, ctx] = canvas(size);
  const pad = 3;
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, 9);
  ctx.fill();
  ctx.stroke();
  ctx.translate(size * 0.2, size * 0.2);
  ctx.scale((size * 0.6) / 24, (size * 0.6) / 24);
  ctx.fillStyle = border;
  ctx.fill(new Path2D(ICONS[mode]), 'evenodd');
  return pixels(ctx, size);
}

/** An inline SVG mode icon for popups. */
export function iconSvg(mode: Mode, className = 'tm-icon') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[iconFor(mode)]);
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

export function startTransitMap(root: HTMLElement) {
  const container = root.querySelector<HTMLElement>('[data-map]')!;
  const statusEl = root.querySelector<HTMLElement>('[data-status]')!;
  const modeInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="mode"]')];
  const layerInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="layer"]')];
  const regionSelect = root.querySelector<HTMLSelectElement>('[data-region]');
  const systemRows = new Map([...document.querySelectorAll<HTMLElement>('[data-system]')].map((r) => [r.dataset.system!, r]));

  let meta: Meta | null = null;
  let routesGeo: GeoJSON.FeatureCollection | null = null;
  let stopsGeo: GeoJSON.FeatureCollection | null = null;
  let stopIndex = new Map<string, string>(); // `${system}:${stopId}` -> name
  let vehiclesGeo: GeoJSON.FeatureCollection<GeoJSON.Point> = { type: 'FeatureCollection', features: [] };
  let live: Live | null = null;
  let selectedRoute = -1;
  let hoverRoute = -1;
  let focusSystem = -1; // index into meta.systems, or -1 for everyone
  let display: string[] = []; // route index -> line color shown on the map
  let owner: number[] = []; // agency index -> the system it belongs to on the map
  const searchInput = root.querySelector<HTMLInputElement>('[data-search]');
  const searchList = root.querySelector<HTMLElement>('[data-results]');
  const focusEl = root.querySelector<HTMLElement>('[data-focus]');
  let currentTheme = theme();
  let popup: maplibregl.Popup | null = null;

  // Route lookup for live vehicles: `${system}:${routeId}` first, then the same route id
  // under an agency with the system's name (Sound Transit's buses live in other zips).
  const routeByKey = new Map<string, number>();
  const routesById = new Map<string, number[]>();
  const systemIndex = new Map<string, number>();

  const map = new maplibregl.Map({
    container,
    style: STYLES[currentTheme],
    bounds: REGIONS.puget.bounds,
    fitBoundsOptions: { padding: 20 },
    minZoom: 5,
    maxBounds: [-130, 43, -110, 51],
    attributionControl: { compact: true },
    cooperativeGestures: matchMedia('(pointer: coarse)').matches,
    dragRotate: false,
    pitchWithRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, fitBoundsOptions: { maxZoom: 14 } }), 'top-right');
  map.addControl(new maplibregl.FullscreenControl({ container: root.querySelector<HTMLElement>('[data-frame]')! }), 'top-right');

  // ---------- Filters ----------

  const activeModes = () => modeInputs.filter((i) => i.checked).map((i) => i.value as Mode);
  const showing = (name: string) => layerInputs.find((i) => i.value === name)?.checked ?? true;
  const official = () => layerInputs.find((i) => i.value === 'official')?.checked ?? false;
  let lastOfficial = false;
  const colorOf = (route: number) => (official() ? meta!.routes[route][4] : display[route] ?? meta!.routes[route][4]);

  function applyFilters() {
    if (!map.getLayer('routes')) return;
    const modes = activeModes();
    // "Other" vehicles show with buses.
    const modeFilter: maplibregl.FilterSpecification = ['in', ['get', 'm'], ['literal', modes.includes('bus') ? [...modes, 'other'] : modes]];
    map.setFilter('routes', modeFilter);
    map.setFilter('routes-casing', modeFilter);
    map.setFilter('vehicles', ['all', modeFilter, ['!', ['has', 'b']]]);
    map.setFilter('vehicles-heading', ['all', modeFilter, ['has', 'b']]);
    map.setFilter('vehicle-labels', modeFilter);
    map.setFilter('vehicle-icons', modeFilter);
    const stopModes = (kinds: Mode[]): maplibregl.FilterSpecification => ['in', ['get', 'm'], ['literal', kinds.filter((m) => modes.includes(m) || (m === 'other' && modes.includes('bus')))]];
    map.setFilter('stops', stopModes(['bus', 'other']));
    map.setFilter('stations', stopModes(['rail', 'tram', 'ferry']));
    const vis = (on: boolean) => (on ? 'visible' : 'none');
    for (const id of ['routes', 'routes-casing', 'route-selected', 'route-selected-casing']) map.setLayoutProperty(id, 'visibility', vis(showing('routes')));
    for (const id of ['stops', 'stations', 'stop-labels']) map.setLayoutProperty(id, 'visibility', vis(showing('stops')));
    map.setLayoutProperty('route-labels', 'visibility', vis(showing('routes')));
    map.setFilter('route-labels', modeFilter);
    // Official agency colors, or distinct colors so neighboring routes are easy to tell apart.
    const key = official() ? 'c' : 'd';
    for (const id of ['routes', 'route-selected', 'route-hover']) map.setPaintProperty(id, 'line-color', ['get', key]);
    map.setPaintProperty('route-labels', 'icon-color', ['get', key]);
    map.setPaintProperty('route-labels', 'text-color', ['get', `${key}t`]);
    if (lastOfficial !== official()) {
      lastOfficial = official();
      renderVehicles();
    }
    updateStatus();
  }
  modeInputs.forEach((i) => i.addEventListener('change', applyFilters));
  layerInputs.forEach((i) => i.addEventListener('change', applyFilters));
  regionSelect?.addEventListener('change', () => {
    const region = REGIONS[regionSelect.value];
    if (region) map.fitBounds(region.bounds, { padding: 20, duration: reducedMotion() ? 0 : 800 });
  });

  // ---------- Layers ----------

  function addOverlay() {
    const dark = currentTheme === 'dark';
    const halo = dark ? '#141317' : '#ffffff';
    // Marker images (a new style drops them, so they're added on every style load).
    const add = (name: string, image: ReturnType<typeof pixels>, sdf = false) => {
      if (!map.hasImage(name)) map.addImage(name, image, { sdf, pixelRatio: 2 });
    };
    add('arrow', arrowImage(), true);
    if (!map.hasImage('chip')) map.addImage('chip', chipImage(), { sdf: true, pixelRatio: 2, stretchX: [[10, 14]], stretchY: [[10, 14]], content: [7, 5, 17, 19] });
    for (const mode of ICON_MODES) {
      add(`glyph-${mode}-w`, glyphImage(mode, '#ffffff'));
      add(`glyph-${mode}-k`, glyphImage(mode, '#111111'));
      if (mode !== 'bus') add(`station-${mode}`, stationImage(mode, dark ? '#1e1c22' : '#ffffff', MODE_COLORS[mode]));
    }

    map.addSource('routes', { type: 'geojson', data: routesGeo ?? { type: 'FeatureCollection', features: [] }, tolerance: 0.5 });
    map.addSource('stops', { type: 'geojson', data: stopsGeo ?? { type: 'FeatureCollection', features: [] } });
    map.addSource('vehicles', { type: 'geojson', data: vehiclesGeo });

    // Buses thin, rail and ferries bolder; `extra` widens it for the casing and selection.
    const width = (extra = 0): maplibregl.ExpressionSpecification => {
      const at = (bus: number, other: number): maplibregl.ExpressionSpecification => ['match', ['get', 'm'], 'bus', bus + extra, other + extra];
      return ['interpolate', ['linear'], ['zoom'], 6, at(0.5, 1.2), 10, at(1.4, 2.6), 14, at(3, 5), 17, at(6, 9)];
    };
    const lineWidth = width();
    const sortKey: maplibregl.DataDrivenPropertyValueSpecification<number> = ['match', ['get', 'm'], 'rail', 3, 'tram', 2, 'ferry', 1, 0];

    map.addLayer({
      id: 'routes-casing',
      type: 'line',
      source: 'routes',
      layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': sortKey },
      paint: { 'line-color': halo, 'line-opacity': 0.9, 'line-width': width(2) },
    });
    map.addLayer({
      id: 'routes',
      type: 'line',
      source: 'routes',
      layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': sortKey },
      paint: { 'line-color': ['get', 'c'], 'line-width': lineWidth, 'line-opacity': routeOpacity() },
    });
    map.addLayer({
      id: 'route-selected-casing',
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'i'], selectedRoute],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': halo, 'line-width': width(7) },
    });
    map.addLayer({
      id: 'route-selected',
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'i'], selectedRoute],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'd'], 'line-width': width(3.5) },
    });
    map.addLayer({
      id: 'route-hover',
      type: 'line',
      source: 'routes',
      filter: ['==', ['get', 'i'], hoverRoute],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'd'], 'line-width': width(2) },
    });
    map.addLayer({
      id: 'stops',
      type: 'circle',
      source: 'stops',
      minzoom: 12.5,
      filter: ['in', ['get', 'm'], ['literal', ['bus', 'other']]],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 1.8, 14, 3, 16, 5.5],
        'circle-color': halo,
        'circle-stroke-color': dark ? '#aaa5b2' : '#5b5862',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12.5, 1, 16, 1.6],
      },
    });
    map.addLayer({
      id: 'stop-labels',
      type: 'symbol',
      source: 'stops',
      minzoom: 15.5,
      filter: ['in', ['get', 'm'], ['literal', ['bus', 'other']]],
      layout: {
        'text-field': ['get', 'n'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-anchor': 'left',
        'text-offset': [0.8, 0],
        'text-optional': true,
      },
      paint: { 'text-color': dark ? '#aaa5b2' : '#5b5862', 'text-halo-color': halo, 'text-halo-width': 1.4 },
    });

    map.addLayer({
      id: 'stations',
      type: 'symbol',
      source: 'stops',
      minzoom: 10,
      filter: ['in', ['get', 'm'], ['literal', ['rail', 'tram', 'ferry']]],
      layout: {
        'icon-image': ['concat', 'station-', ['get', 'm']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.55, 13, 0.8, 16, 1],
        // Platforms of one station overlap; show one badge instead of a pile.
        'icon-allow-overlap': false,
        'icon-padding': 1,
        'text-field': ['step', ['zoom'], '', 13, ['get', 'n']],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-anchor': 'left',
        'text-offset': [1.3, 0],
        'text-optional': true,
      },
      paint: { 'text-color': dark ? '#f3efe8' : '#1b1a1f', 'text-halo-color': halo, 'text-halo-width': 1.6 },
    });

    // Route numbers along the lines, as small colored chips.
    map.addLayer({
      id: 'route-labels',
      type: 'symbol',
      source: 'routes',
      minzoom: 11.5,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 12, 220, 16, 360],
        'symbol-sort-key': ['match', ['get', 'm'], 'rail', 0, 'tram', 1, 'ferry', 2, 3],
        'text-field': ['get', 'n'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 12],
        'text-rotation-alignment': 'viewport',
        'text-max-width': 6,
        'icon-image': 'chip',
        'icon-text-fit': 'both',
        'icon-rotation-alignment': 'viewport',
        'text-padding': 4,
      },
      paint: { 'icon-color': ['get', 'd'], 'text-color': ['get', 'dt'] },
    });

    const vehicleColor: maplibregl.ExpressionSpecification = ['coalesce', ['get', 'c'], '#868e96'];
    // Small dots when zoomed out; from street level up, big enough to hold a mode icon.
    const radius: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 6, 2.5, 10, 4.5, 12, 8.5, 14, 11, 17, 14];
    map.addLayer({
      id: 'vehicles',
      type: 'circle',
      source: 'vehicles',
      paint: {
        'circle-radius': radius,
        'circle-color': vehicleColor,
        'circle-stroke-color': halo,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 1.8],
        'circle-opacity': ['case', ['get', 'o'], 0.55, 1],
        'circle-stroke-opacity': ['case', ['get', 'o'], 0.55, 1],
      },
    });
    map.addLayer({
      id: 'vehicles-heading',
      type: 'symbol',
      source: 'vehicles',
      layout: {
        'icon-image': 'arrow',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.29, 10, 0.52, 12, 0.98, 14, 1.28, 17, 1.63],
        'icon-rotate': ['get', 'b'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-color': vehicleColor, 'icon-halo-color': halo, 'icon-halo-width': 1.6, 'icon-opacity': ['case', ['get', 'o'], 0.55, 1] },
    });
    map.addLayer({
      id: 'vehicle-icons',
      type: 'symbol',
      source: 'vehicles',
      minzoom: 11.5,
      layout: {
        'icon-image': ['concat', 'glyph-', ['match', ['get', 'm'], 'other', 'bus', ['get', 'm']], '-', ['get', 't']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11.5, 0.42, 14, 0.6, 17, 0.76],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12, 1] },
    });
    map.addLayer({
      id: 'vehicle-labels',
      type: 'symbol',
      source: 'vehicles',
      minzoom: 13,
      layout: {
        'text-field': ['get', 'n'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 17, 14],
        'text-offset': [0, -1.9],
        'text-anchor': 'bottom',
        'text-optional': true,
      },
      paint: { 'text-color': dark ? '#f3efe8' : '#1b1a1f', 'text-halo-color': halo, 'text-halo-width': 1.6 },
    });
    applyFilters();
    select(selectedRoute);
  }

  map.on('style.load', addOverlay);

  // Follow the site's light/dark setting.
  const onTheme = () => {
    const next = theme();
    if (next === currentTheme) return;
    currentTheme = next;
    map.setStyle(STYLES[next]);
  };
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);

  // ---------- Static data ----------

  async function loadStatic() {
    const [m, r] = await Promise.all([fetch(`${DATA}/meta.json`).then((x) => x.json()), fetch(`${DATA}/routes.json`).then((x) => x.json())]);
    meta = m as Meta;
    meta.systems.forEach((s, i) => systemIndex.set(s.key, i));
    meta.routes.forEach((row, i) => {
      const sys = meta!.systems[meta!.agencies[row[0]][0]].key;
      routeByKey.set(`${sys}:${row[1]}`, i);
      const list = routesById.get(row[1]) ?? [];
      list.push(i);
      routesById.set(row[1], list);
    });
    // A route belongs to the system named like its agency (Sound Transit's express buses
    // ship in King County, Pierce and Community Transit's files), else to its file's system.
    const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byName = new Map(meta.systems.map((s, i) => [norm(s.name), i]));
    owner = meta.agencies.map(([sys, name]) => byName.get(norm(name)) ?? sys);
    // Agencies that give many bus routes one color get distinct colors per route instead,
    // cycling in route order so neighbors differ. Branded lines (Link, RapidRide) keep theirs.
    const groups = new Map<string, number[]>();
    meta.routes.forEach((row, i) => {
      const key = `${row[0]}|${row[4]}|${row[5]}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    });
    display = meta.routes.map((row) => row[4]);
    for (const members of groups.values()) {
      if (members.length < 4) continue;
      members.forEach((i, n) => (display[i] = DISTINCT[n % DISTINCT.length]));
    }
    routesGeo = r as GeoJSON.FeatureCollection;
    for (const f of routesGeo.features) {
      const p = f.properties!;
      const i = p.i as number;
      p.s = owner[meta.routes[i][0]];
      p.d = display[i];
      p.ct = chipText(p.c as string);
      p.dt = chipText(p.d as string);
      routeFeature.set(i, f);
    }
    (map.getSource('routes') as GeoJSONSource | undefined)?.setData(routesGeo);
    buildSearch();
  }

  const routeFeature = new Map<number, GeoJSON.Feature>();

  async function loadStops() {
    const { stops } = (await fetch(`${DATA}/stops.json`).then((x) => x.json())) as { stops: StopRow[] };
    stopIndex = new Map(stops.map((s) => [`${s[4]}:${s[5]}`, s[2]]));
    stopsGeo = {
      type: 'FeatureCollection',
      features: stops.map((s, i) => {
        // A stop takes its most prominent mode: a station if any train, light rail or ferry stops there.
        let m: Mode = 'bus';
        for (const r of s[3]) {
          const mode = meta?.routes[r]?.[5];
          if (mode && MODE_RANK[mode] > MODE_RANK[m]) m = mode;
        }
        const properties: Record<string, unknown> = { i, m, n: s[2] };
        return { type: 'Feature', id: i, properties, geometry: { type: 'Point', coordinates: [s[0], s[1]] } };
      }),
    };
    stopRows = stops;
    (map.getSource('stops') as GeoJSONSource | undefined)?.setData(stopsGeo);
  }
  let stopRows: StopRow[] = [];

  function routeFor(feedKey: string, routeId: string): number {
    if (!meta || !routeId) return -1;
    const system = meta.systems.find((s) => s.key === feedKey);
    const from = feedSystems.get(feedKey) ?? feedKey;
    const direct = routeByKey.get(`${from}:${routeId}`) ?? routeByKey.get(`${feedKey}:${routeId}`);
    if (direct !== undefined) return direct;
    const candidates = routesById.get(routeId) ?? [];
    const sameName = candidates.find((i) => meta!.agencies[meta!.routes[i][0]][1] === system?.name);
    if (sameName !== undefined) return sameName;
    return candidates.length === 1 ? candidates[0] : -1;
  }
  // Live feeds whose route ids belong to another system's schedule.
  const feedSystems = new Map<string, string>(JSON.parse(root.dataset.routesFrom ?? '[]'));
  const shops = new Map<string, string>(JSON.parse(root.dataset.shops ?? '[]'));

  // ---------- Live vehicles ----------

  let glide = 0;
  function setVehicles(next: GeoJSON.FeatureCollection<GeoJSON.Point>) {
    const source = map.getSource('vehicles') as GeoJSONSource | undefined;
    const previous = new Map(vehiclesGeo.features.map((f) => [f.properties!.k as string, f.geometry.coordinates]));
    vehiclesGeo = next;
    cancelAnimationFrame(glide);
    if (!source) return;
    if (reducedMotion() || !previous.size) {
      source.setData(next);
      return;
    }
    // Glide each vehicle from where it was to where it is now.
    const from = next.features.map((f) => previous.get(f.properties!.k as string) ?? f.geometry.coordinates);
    const to = next.features.map((f) => f.geometry.coordinates);
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / GLIDE_MS);
      const e = 1 - (1 - t) ** 3;
      const features = next.features.map((f, i) => ({
        ...f,
        geometry: { type: 'Point' as const, coordinates: [from[i][0] + (to[i][0] - from[i][0]) * e, from[i][1] + (to[i][1] - from[i][1]) * e] },
      }));
      source.setData({ type: 'FeatureCollection', features });
      if (t < 1) glide = requestAnimationFrame(frame);
    };
    glide = requestAnimationFrame(frame);
  }

  async function poll() {
    try {
      const res = await fetch('/transit/api/vehicles.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      live = (await res.json()) as Live;
    } catch {
      statusEl.textContent = 'Live positions didn’t load. Trying again shortly.';
      return;
    }
    renderVehicles();
    vehicleRows = new Map(live.v.map((row) => [`${live!.feeds[row[0]][0]}:${row[1]}`, row]));
    updateStatus();
    updateSystems();
  }

  function renderVehicles() {
    if (!live || !meta) return;
    const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const row of live.v) {
      const [feed, id, lon, lat, bearing, routeId] = row;
      const feedKey = live.feeds[feed][0];
      const r = routeFor(feedKey, routeId);
      const route = r >= 0 ? meta?.routes[r] : undefined;
      const sys = meta?.systems[systemIndex.get(feedKey) ?? -1];
      const defaultMode: Mode = sys && ['wsf', 'pcf'].includes(sys.key) ? 'ferry' : feedKey === 'sss' ? 'tram' : 'bus';
      const props: Record<string, unknown> = {
        k: `${feedKey}:${id}`,
        f: feed,
        r,
        m: route?.[5] ?? defaultMode,
        c: route ? colorOf(r) : MODE_COLORS[defaultMode],
        // Ferries go by their name on the map.
        n: feedKey === 'wsf' && VESSELS[id] ? VESSELS[id].name : route ? route[2] || route[3] : '',
        o: !routeId && !route, // not on a route: parked, deadheading
        s: route ? owner[route[0]] : (systemIndex.get(feedKey) ?? -1),
      };
      props.t = chipText(props.c as string) === '#ffffff' ? 'w' : 'k';
      if (bearing !== null) props.b = bearing;
      features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
    }
    // Trains over buses.
    features.sort((a, b) => MODE_RANK[a.properties!.m as Mode] - MODE_RANK[b.properties!.m as Mode]);
    setVehicles({ type: 'FeatureCollection', features });
  }
  let vehicleRows = new Map<string, VehicleRow>();

  function updateStatus() {
    if (!live) return;
    const modes = new Set(activeModes());
    if (modes.has('bus')) modes.add('other');
    const shown = vehiclesGeo.features.filter((f) => modes.has(f.properties!.m as Mode)).length;
    const reporting = live.feeds.filter((f) => f[1] && f[2] > 0).length;
    const secs = Math.max(0, Date.now() / 1000 - live.t);
    statusEl.textContent = `${shown.toLocaleString()} vehicles live from ${reporting} agencies · updated ${ago(secs)}`;
  }

  function updateSystems() {
    if (!live) return;
    for (const [key, ok, count, , error] of live.feeds) {
      const row = systemRows.get(key);
      const out = row?.querySelector<HTMLElement>('[data-count]');
      if (!row || !out) continue;
      row.dataset.state = !ok ? 'error' : count ? 'live' : 'quiet';
      out.textContent = !ok ? 'Feed not answering' : count ? `${count.toLocaleString()} live` : 'None running';
      out.title = error ?? '';
    }
  }

  // ---------- Popups and selection ----------

  // Everything else fades back while one route is selected.
  function routeOpacity(): maplibregl.DataDrivenPropertyValueSpecification<number> {
    const base: maplibregl.ExpressionSpecification = ['case', ['==', ['get', 'm'], 'ferry'], 0.7, 0.85];
    if (selectedRoute >= 0) return 0.18;
    if (focusSystem >= 0) return ['case', ['==', ['get', 's'], focusSystem], base, 0.12];
    return base;
  }

  function routeChip(i: number) {
    const route = meta!.routes[i];
    const color = colorOf(i);
    return el('span', { className: 'tm-chip', style: `background:${color};color:${chipText(color)}` }, route[2] || route[3]);
  }

  // A selected route stands out: drawn thick with a halo on top, everything else fades
  // back, and only its own vehicles stay at full strength.
  function select(route: number) {
    selectedRoute = route;
    if (!map.getLayer('route-selected')) return;
    const only: maplibregl.FilterSpecification = ['==', ['get', 'i'], route];
    map.setFilter('route-selected', only);
    map.setFilter('route-selected-casing', only);
    map.setPaintProperty('routes', 'line-opacity', routeOpacity());
    map.setPaintProperty('routes-casing', 'line-opacity', route >= 0 ? 0.3 : 0.9);
    // What stays bright: the selected route, else the focused agency, else everything.
    const mine: maplibregl.ExpressionSpecification | null = route >= 0 ? ['==', ['get', 'r'], route] : focusSystem >= 0 ? ['==', ['get', 's'], focusSystem] : null;
    const mineLine: maplibregl.ExpressionSpecification | null = route >= 0 ? ['==', ['get', 'i'], route] : focusSystem >= 0 ? ['==', ['get', 's'], focusSystem] : null;
    const vehicleFade: maplibregl.DataDrivenPropertyValueSpecification<number> = mine ? ['case', mine, 1, 0.18] : ['case', ['get', 'o'], 0.55, 1];
    for (const [layer, prop] of [['vehicles', 'circle-opacity'], ['vehicles', 'circle-stroke-opacity'], ['vehicles-heading', 'icon-opacity'], ['vehicle-icons', 'icon-opacity']] as const) {
      map.setPaintProperty(layer, prop, layer === 'vehicle-icons' && !mine ? ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12, 1] : vehicleFade);
    }
    map.setPaintProperty('vehicle-labels', 'text-opacity', mine ? ['case', mine, 1, 0] : 1);
    map.setPaintProperty('route-labels', 'icon-opacity', mineLine ? ['case', mineLine, 1, 0.12] : 1);
    map.setPaintProperty('route-labels', 'text-opacity', mineLine ? ['case', mineLine, 1, 0.12] : 1);
  }

  function show(lngLat: maplibregl.LngLatLike, content: HTMLElement) {
    popup?.remove();
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '18rem', className: 'tm-popup', focusAfterOpen: false })
      .setLngLat(lngLat)
      .setDOMContent(content)
      .addTo(map);
    popup.on('close', () => select(-1));
  }

  function routeHeading(i: number) {
    const route = meta!.routes[i];
    const agency = meta!.agencies[route[0]][1];
    return [
      el('p', { className: 'tm-title' }, routeChip(i), ' ', route[3] && route[2] ? route[3] : ''),
      el('p', { className: 'tm-meta' }, iconSvg(route[5]), `${MODE_NAMES[route[5]]} · ${agency}`),
    ];
  }

  function vehiclePopup(f: MapGeoJSONFeature) {
    const key = f.properties.k as string;
    const row = vehicleRows.get(key);
    if (!row || !live || !meta) return;
    const [feed, , , , , routeId, label, ts, speed, status, stopId] = row;
    const feedKey = live.feeds[feed][0];
    const r = f.properties.r as number;
    const sysName = meta.systems[systemIndex.get(feedKey) ?? 0]?.name ?? feedKey;
    // Ferries between sailings have no route; they're still in service.
    const idle = feedKey === 'wsf' ? sysName : 'Not in service';
    const parts: (HTMLElement | null)[] = r >= 0 ? routeHeading(r) : [el('p', { className: 'tm-title' }, routeId ? `Route ${routeId}` : idle), el('p', { className: 'tm-meta' }, routeId || feedKey !== 'wsf' ? sysName : 'Between sailings')];
    const from = feedSystems.get(feedKey) ?? feedKey;
    const art = vehicleArt(feedKey, row[1], label, r);
    if (art) parts.push(art);
    const stopName = stopId ? stopIndex.get(`${systemIndex.get(from)}:${stopId}`) : undefined;
    if (stopName) parts.push(el('p', {}, `${STATUS_WORDS[status ?? 2] ?? 'Heading to'} ${stopName}`));
    const details = [label && !art && `Vehicle ${label}`, speed !== null && speed > 0.5 ? `${Math.round(speed * 2.237)} mph` : null, ts ? `seen ${ago(Date.now() / 1000 - ts)}` : null].filter(Boolean).join(' · ');
    if (details) parts.push(el('p', { className: 'tm-meta' }, details));
    select(r);
    show(f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : map.getCenter(), el('div', {}, ...parts));
  }

  /** What this vehicle is, with a drawing: ferries by vessel, King County Metro buses by fleet number. */
  function vehicleArt(feedKey: string, id: string, label: string, route: number) {
    const figure = (svg: string, title: string, facts: string) => {
      const f = el('figure', { className: 'tm-vehicle' });
      f.innerHTML = svg; // drawn by transit-vehicles.ts from fixed shapes, no outside text
      f.append(el('figcaption', {}, el('strong', {}, title), el('span', {}, facts)));
      return f;
    };
    if (feedKey === 'wsf') {
      const v = VESSELS[id];
      if (!v) return null;
      return figure(ferrySvg(v.cls), `M/V ${v.name}`, `${v.cls} class · built ${v.built} · ${v.feet} ft · ${v.cars} cars, ${v.people.toLocaleString()} people`);
    }
    if (feedKey === 'kcm') {
      const bus = kcmBus(label || id);
      if (!bus) return null;
      const color = route >= 0 ? colorOf(route) : MODE_COLORS.bus;
      return figure(busSvg(bus, color), `Bus ${label || id}`, [bus.model, POWER_WORDS[bus.power], `${bus.feet} ft`, bus.years === 'new' ? 'new' : `from ${bus.years}`, bus.note].filter(Boolean).join(' · '));
    }
    return null;
  }

  function stopPopup(f: MapGeoJSONFeature) {
    const s = stopRows[f.properties.i as number];
    if (!s || !meta) return;
    const chips = el('p', { className: 'tm-chips' }, ...s[3].slice(0, 30).map(routeChip));
    const agencies = [...new Set(s[3].map((r) => meta!.agencies[meta!.routes[r][0]][1]))].join(', ');
    select(-1);
    const mode = f.properties.m as Mode;
    const title = el('p', { className: 'tm-title' }, mode !== 'bus' ? iconSvg(mode, 'tm-icon tm-station') : null, s[2]);
    show([s[0], s[1]], el('div', {}, title, el('p', { className: 'tm-meta' }, agencies || meta.systems[s[4]].name), chips));
  }

  function routePopup(f: MapGeoJSONFeature, lngLat: maplibregl.LngLat) {
    const i = f.properties.i as number;
    if (!meta?.routes[i]) return;
    select(i);
    show(lngLat, el('div', {}, ...routeHeading(i), ...routeExtras(i)));
  }

  function routeExtras(i: number) {
    const running = vehiclesGeo.features.filter((f) => f.properties!.r === i).length;
    const system = owner[meta!.routes[i][0]];
    const button = el('button', { type: 'button', className: 'tm-link' }, `All of ${meta!.systems[system].name}`);
    button.addEventListener('click', () => focusOn(system));
    const links = el('p', { className: 'tm-links' }, button);
    const site = websiteOf(system);
    if (site) links.append(el('a', { href: site, target: '_blank', rel: 'noopener' }, 'Website ↗'));
    const shop = shops.get(meta!.systems[system].key);
    if (shop) links.append(el('a', { href: shop, target: '_blank', rel: 'noopener' }, 'Merch shop ↗'));
    return [el('p', { className: 'tm-meta' }, running ? `${running} running now` : 'None running right now'), links];
  }

  /** The agency's website, as it publishes it in its schedule data. */
  function websiteOf(system: number) {
    const name = meta!.systems[system].name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const owned = meta!.agencies.filter((_, a) => owner[a] === system);
    return (owned.find((a) => a[1].toLowerCase().replace(/[^a-z0-9]/g, '') === name && a[2]) ?? owned.find((a) => a[2]))?.[2];
  }

  // ---------- Focus on one agency, find a route ----------

  function boundsOf(features: GeoJSON.Feature[]) {
    const b = new maplibregl.LngLatBounds();
    for (const f of features) {
      const g = f.geometry as GeoJSON.LineString | GeoJSON.MultiLineString;
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      for (const line of lines) for (const c of line) b.extend(c as [number, number]);
    }
    return b;
  }

  function focusOn(system: number) {
    focusSystem = system;
    popup?.remove();
    select(-1);
    const features = (routesGeo?.features ?? []).filter((f) => f.properties!.s === system);
    if (features.length) map.fitBounds(boundsOf(features), { padding: 40, maxZoom: 13, duration: reducedMotion() ? 0 : 800 });
    if (focusEl) {
      focusEl.hidden = system < 0;
      const name = focusEl.querySelector('[data-focus-name]');
      if (name && system >= 0) name.textContent = meta!.systems[system].name;
      const siteLink = focusEl.querySelector<HTMLAnchorElement>('[data-focus-site]');
      const site = system >= 0 ? websiteOf(system) : undefined;
      if (siteLink) {
        siteLink.hidden = !site;
        if (site) siteLink.href = site;
      }
      const shopLink = focusEl.querySelector<HTMLAnchorElement>('[data-focus-shop]');
      const shop = system >= 0 ? shops.get(meta!.systems[system].key) : undefined;
      if (shopLink) {
        shopLink.hidden = !shop;
        if (shop) shopLink.href = shop;
      }
    }
    const url = new URL(location.href);
    if (system >= 0) url.searchParams.set('agency', meta!.systems[system].key);
    else url.searchParams.delete('agency');
    url.searchParams.delete('route');
    history.replaceState(null, '', url);
  }
  focusEl?.querySelector('button')?.addEventListener('click', () => focusOn(-1));

  function showRoute(i: number) {
    const f = routeFeature.get(i);
    if (!f) return;
    const b = boundsOf([f]);
    map.fitBounds(b, { padding: 60, maxZoom: 14, duration: reducedMotion() ? 0 : 800 });
    select(i);
    show(b.getCenter(), el('div', {}, ...routeHeading(i), ...routeExtras(i)));
  }

  interface SearchItem {
    label: string;
    detail: string;
    words: string;
    short: string;
    route?: number;
    system?: number;
  }
  let searchItems: SearchItem[] = [];

  function buildSearch() {
    if (!meta) return;
    const items: SearchItem[] = [];
    meta.systems.forEach((s, system) => {
      if (!(routesGeo?.features ?? []).some((f) => f.properties!.s === system)) return;
      items.push({ label: s.name, detail: 'Agency', words: s.name.toLowerCase(), short: '', system });
    });
    for (const i of routeFeature.keys()) {
      const [agency, , short, long, , mode] = meta.routes[i];
      const agencyName = meta.agencies[agency][1];
      items.push({
        label: short && long ? `${short} · ${long}` : short || long,
        detail: `${MODE_NAMES[mode]} · ${agencyName}`,
        words: `${short} ${long} ${agencyName}`.toLowerCase(),
        short: short.toLowerCase(),
        route: i,
      });
    }
    searchItems = items;
  }

  let results: SearchItem[] = [];
  let active = -1;

  function renderResults() {
    if (!searchList || !searchInput) return;
    searchList.replaceChildren(
      ...results.map((item, n) => {
        const li = el('li', { id: `tm-result-${n}`, className: n === active ? 'active' : '' });
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(n === active));
        if (item.route !== undefined) li.append(routeChip(item.route), ' ');
        li.append(el('span', { className: 'tm-result-label' }, item.route !== undefined && meta!.routes[item.route][2] ? meta!.routes[item.route][3] || item.label : item.label), el('span', { className: 'tm-result-detail' }, item.detail));
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          choose(item);
        });
        return li;
      }),
    );
    searchList.hidden = !results.length;
    searchInput.setAttribute('aria-expanded', String(results.length > 0));
    if (active >= 0) searchInput.setAttribute('aria-activedescendant', `tm-result-${active}`);
    else searchInput.removeAttribute('aria-activedescendant');
  }

  function runSearch() {
    const q = searchInput!.value.trim().toLowerCase();
    active = -1;
    if (!q) {
      results = [];
      return renderResults();
    }
    const terms = q.split(/\s+/);
    const scored: [number, SearchItem][] = [];
    for (const item of searchItems) {
      if (!terms.every((t) => item.words.includes(t))) continue;
      let score = item.system !== undefined ? 1 : 2;
      if (item.short === q) score -= 3;
      else if (item.short.startsWith(q)) score -= 1.5;
      else if (item.words.startsWith(q)) score -= 1;
      scored.push([score, item]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label, 'en', { numeric: true }));
    results = scored.slice(0, 8).map(([, item]) => item);
    renderResults();
  }

  function choose(item: SearchItem) {
    if (!searchInput) return;
    searchInput.value = '';
    results = [];
    renderResults();
    searchInput.blur();
    if (item.system !== undefined) focusOn(item.system);
    else if (item.route !== undefined) showRoute(item.route);
  }

  searchInput?.addEventListener('input', runSearch);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      renderResults();
    } else if (e.key === 'Enter') {
      const item = results[active >= 0 ? active : 0];
      if (item) {
        e.preventDefault();
        choose(item);
      }
    } else if (e.key === 'Escape') {
      results = [];
      renderResults();
    }
  });
  searchInput?.addEventListener('blur', () => {
    results = [];
    renderResults();
  });

  // Links like /transit/?agency=kcm or ?route=kcm:100001 open focused.
  function applyUrl() {
    if (!meta) return;
    const params = new URLSearchParams(location.search);
    const agency = params.get('agency');
    const route = params.get('route');
    if (route) {
      const i = routeByKey.get(route);
      const canonical = i !== undefined ? (routeFeature.has(i) ? i : [...routeFeature.keys()].find((k) => meta!.routes[k][2] === meta!.routes[i][2] && meta!.routes[k][5] === meta!.routes[i][5])) : undefined;
      if (canonical !== undefined) return showRoute(canonical);
    }
    if (agency && systemIndex.has(agency)) focusOn(systemIndex.get(agency)!);
  }

  map.on('click', (e) => {
    const pad = (n: number) => [
      [e.point.x - n, e.point.y - n],
      [e.point.x + n, e.point.y + n],
    ] as [maplibregl.PointLike, maplibregl.PointLike];
    const vehicle = map.queryRenderedFeatures(pad(8), { layers: ['vehicles', 'vehicles-heading'].filter((l) => map.getLayer(l)) })[0];
    if (vehicle) return vehiclePopup(vehicle);
    const stop = map.queryRenderedFeatures(pad(8), { layers: ['stations', 'stops'].filter((l) => map.getLayer(l)) })[0];
    if (stop) return stopPopup(stop);
    const route = map.queryRenderedFeatures(pad(5), { layers: ['routes'].filter((l) => map.getLayer(l)) })[0];
    if (route) return routePopup(route, e.lngLat);
    popup?.remove();
    select(-1);
  });
  // Hovering a line thickens it, so it's clear which route is which where they bunch up.
  map.on('mousemove', 'routes', (e) => {
    const i = (e.features?.[0]?.properties?.i as number | undefined) ?? -1;
    if (i === hoverRoute) return;
    hoverRoute = i;
    map.setFilter('route-hover', ['==', ['get', 'i'], i]);
  });
  map.on('mouseleave', 'routes', () => {
    hoverRoute = -1;
    if (map.getLayer('route-hover')) map.setFilter('route-hover', ['==', ['get', 'i'], -1]);
  });
  for (const layer of ['vehicles', 'vehicles-heading', 'stations', 'stops', 'routes']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }

  // ---------- Start ----------

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    if (!document.hidden) timer = window.setTimeout(async () => {
      await poll();
      schedule();
    }, POLL_MS);
  };
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return clearTimeout(timer);
    await poll();
    schedule();
  });
  setInterval(updateStatus, 5000);

  loadStatic()
    .then(async () => {
      applyUrl();
      await poll();
      schedule();
      await loadStops();
    })
    .catch(() => {
      statusEl.textContent = 'The map data didn’t load. Try reloading the page.';
    });

  return map;
}
