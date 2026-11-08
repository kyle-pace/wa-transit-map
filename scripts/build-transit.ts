/*
  Build the routes and stops for the live transit map: node scripts/build-transit.ts

  Downloads every GTFS schedule zip in src/lib/transit-feeds.ts and writes three files to
  public/transit/, which /transit/ loads as plain static assets:

  - meta.json    systems, agencies and every route (name, color, mode). The live
                 vehicles look their route up here.
  - routes.json  GeoJSON lines, one feature per route, simplified to about 6 m.
  - stops.json   every served stop: position, name, the routes that stop there.

  Plus report.json: what each feed gave (or why it failed), for debugging.

  If a feed fails to download, that system's routes and stops from the last good build
  are kept, so one flaky server never wipes an agency off the map.

  Runs weekly on GitHub Actions (.github/workflows/transit-data.yml) and commits only
  when something changed. Needs Node 24 (or 22.18+) and the `unzip` command.

  Options:
    --only <key,key>   build just these systems (the rest come from the last build)

  TRANSIT_STATIC_OVERRIDE='{"kcm":"file:///path/to/gtfs.zip"}' swaps in local zips, for testing.
*/
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { modeOf, systems, type Mode, type TransitSystem } from '../src/lib/transit-feeds.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(root, 'public/transit');
const TMP = join(root, '.transit-tmp');
const USER_AGENT = 'kylepace.dev transit map (https://kylepace.dev/transit/)';

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

// Default line colors for routes that don't set one: a distinct, mid-tone color per system
// so neighboring agencies are easy to tell apart on light and dark maps.
const PALETTE = ['#2f6fdf', '#d6336c', '#0c8a6a', '#e8590c', '#7048e8', '#1098ad', '#c2255c', '#5c940d', '#ae3ec9', '#d9480f', '#1c7ed6', '#2b8a3e'];

// ---------- Types ----------

interface BundleRoute {
  agency: number; // index into bundle.agencies
  id: string;
  short: string;
  long: string;
  color: string;
  mode: Mode;
  geom: number[][][]; // lines of [lon, lat]
}
interface BundleStop {
  id: string;
  name: string;
  lon: number;
  lat: number;
  routes: string[]; // `${systemKey}:${routeId}`
}
interface Bundle {
  agencies: string[];
  /** Each agency's website, from agency.txt (same order as agencies). */
  urls: string[];
  routes: BundleRoute[];
  stops: BundleStop[];
}
interface Report {
  ok: boolean;
  source?: string;
  error?: string;
  kept?: boolean;
  agencies?: string[];
  routes?: number;
  routesWithGeometry?: number;
  stops?: number;
  ms?: number;
}

// ---------- CSV ----------

function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Streams a GTFS text file, calling `row` with a getter for each line. */
async function eachRow(file: string | undefined, row: (get: (col: string) => string) => void): Promise<boolean> {
  if (!file) return false;
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header: Map<string, number> | null = null;
  let cells: string[] = [];
  const get = (col: string) => {
    const i = header!.get(col);
    return i === undefined ? '' : (cells[i] ?? '').trim();
  };
  for await (const raw of lines) {
    if (!header) {
      header = new Map(splitCsvLine(raw.replace(/^﻿/, '')).map((h, i) => [h.trim().toLowerCase(), i]));
      continue;
    }
    if (!raw.trim()) continue;
    cells = splitCsvLine(raw);
    row(get);
  }
  return true;
}

// ---------- Geometry ----------

/** Douglas-Peucker on [lon, lat] points, tolerance in meters. */
function simplify(points: number[][], tolerance = 6): number[][] {
  if (points.length <= 2) return points;
  const lat0 = (points[0][1] * Math.PI) / 180;
  const kx = 111320 * Math.cos(lat0);
  const ky = 110540;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = points[a][0] * kx, ay = points[a][1] * ky;
    const bx = points[b][0] * kx, by = points[b][1] * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i][0] * kx, py = points[i][1] * ky;
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

function cleanLine(points: number[][]): number[][] {
  const out: number[][] = [];
  for (const [lon, lat] of points) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || (lon === 0 && lat === 0)) continue;
    const p = [round(lon), round(lat)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return simplify(out);
}

// ---------- Download and unzip ----------

async function download(url: string, dest: string): Promise<void> {
  if (url.startsWith('file://')) {
    writeFileSync(dest, readFileSync(fileURLToPath(url)));
    return;
  }
  // One retry: a few agency servers have off moments.
  let res: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/zip, application/octet-stream;q=0.9, */*;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
    if (res.ok) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!res) throw new Error('no response');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error(`not a zip (${res.headers.get('content-type') ?? 'no type'}, ${buf.length} bytes)`);
  writeFileSync(dest, buf);
}

function findFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (!files.has(name.toLowerCase())) files.set(name.toLowerCase(), p);
    }
  };
  walk(dir);
  return files;
}

// ---------- One GTFS feed into a bundle ----------

async function readGtfs(system: TransitSystem, dir: string, defaultColor: string): Promise<Bundle> {
  const files = findFiles(dir);
  if (!files.has('routes.txt') || !files.has('trips.txt')) throw new Error('no routes.txt or trips.txt in the zip');

  // Agencies
  const agencyIds = new Map<string, number>();
  const agencies: string[] = [];
  const urls: string[] = [];
  await eachRow(files.get('agency.txt'), (g) => {
    agencyIds.set(g('agency_id'), agencies.length);
    agencies.push(g('agency_name') || system.name);
    urls.push(/^https?:\/\//i.test(g('agency_url')) ? g('agency_url') : '');
  });
  if (!agencies.length) {
    agencies.push(system.name);
    urls.push('');
  }

  // Routes
  const routes: BundleRoute[] = [];
  const routeIdx = new Map<string, number>();
  await eachRow(files.get('routes.txt'), (g) => {
    const id = g('route_id');
    if (!id || routeIdx.has(id)) return;
    let color = g('route_color').replace('#', '').toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(color) || color === 'ffffff' || color === '000000') color = defaultColor.slice(1);
    routeIdx.set(id, routes.length);
    routes.push({
      agency: agencyIds.get(g('agency_id')) ?? 0,
      id,
      short: g('route_short_name'),
      long: g('route_long_name') || g('route_desc'),
      color: `#${color}`,
      mode: modeOf(g('route_type') === '' ? undefined : Number(g('route_type')), system.mode ?? 'bus'),
      geom: [],
    });
  });

  // Trips: which shapes each route really uses, and a sample trip per direction for
  // routes without shapes.
  const tripRoute = new Map<string, number>();
  const shapeCounts = new Map<string, Map<string, number>>(); // `${route}|${dir}` -> shape -> trips
  const sampleTrip = new Map<string, string>(); // `${route}|${dir}` -> trip
  await eachRow(files.get('trips.txt'), (g) => {
    const r = routeIdx.get(g('route_id'));
    if (r === undefined) return;
    const trip = g('trip_id');
    tripRoute.set(trip, r);
    const key = `${r}|${g('direction_id') || '0'}`;
    const shape = g('shape_id');
    if (shape) {
      let m = shapeCounts.get(key);
      if (!m) shapeCounts.set(key, (m = new Map()));
      m.set(shape, (m.get(shape) ?? 0) + 1);
    }
    if (!sampleTrip.has(key)) sampleTrip.set(key, trip);
  });

  // Up to three common shapes per route and direction: the busiest, plus variants that run
  // at least a quarter as often (branches, short turns that leave the main line).
  const wantShapes = new Map<string, number>(); // shape -> route
  for (const [key, counts] of shapeCounts) {
    const r = Number(key.split('|')[0]);
    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    const top = sorted[0][1];
    for (const [shape, n] of sorted.slice(0, 3)) if (n >= top * 0.25) wantShapes.set(shape, r);
  }

  const shapePts = new Map<string, [number, number, number][]>();
  await eachRow(files.get('shapes.txt'), (g) => {
    const id = g('shape_id');
    if (!wantShapes.has(id)) return;
    let pts = shapePts.get(id);
    if (!pts) shapePts.set(id, (pts = []));
    pts.push([Number(g('shape_pt_sequence')), Number(g('shape_pt_lon')), Number(g('shape_pt_lat'))]);
  });
  for (const [id, pts] of shapePts) {
    pts.sort((a, b) => a[0] - b[0]);
    const line = cleanLine(pts.map((p) => [p[1], p[2]]));
    if (line.length >= 2) routes[wantShapes.get(id)!].geom.push(line);
  }

  // Stops
  const stopInfo = new Map<string, { name: string; lon: number; lat: number }>();
  await eachRow(files.get('stops.txt'), (g) => {
    const lat = Number(g('stop_lat'));
    const lon = Number(g('stop_lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
    stopInfo.set(g('stop_id'), { name: g('stop_name') || g('stop_desc') || 'Stop', lon: round(lon), lat: round(lat) });
  });

  // Stop times: which routes serve each stop, and the stop sequence of sample trips for
  // routes that have no shapes.
  const needSample = new Set<string>();
  for (const [key, trip] of sampleTrip) {
    const r = Number(key.split('|')[0]);
    if (!routes[r].geom.length) needSample.add(trip);
  }
  const samplePts = new Map<string, [number, string][]>();
  const stopRoutes = new Map<string, Set<number>>();
  await eachRow(files.get('stop_times.txt'), (g) => {
    const trip = g('trip_id');
    const r = tripRoute.get(trip);
    if (r === undefined) return;
    const stop = g('stop_id');
    if (!stop) return;
    let set = stopRoutes.get(stop);
    if (!set) stopRoutes.set(stop, (set = new Set()));
    set.add(r);
    if (needSample.has(trip)) {
      let pts = samplePts.get(trip);
      if (!pts) samplePts.set(trip, (pts = []));
      pts.push([Number(g('stop_sequence')), stop]);
    }
  });
  for (const [trip, pts] of samplePts) {
    pts.sort((a, b) => a[0] - b[0]);
    const line = cleanLine(pts.map(([, s]) => stopInfo.get(s)).filter(Boolean).map((s) => [s!.lon, s!.lat]));
    if (line.length >= 2) routes[tripRoute.get(trip)!].geom.push(line);
  }

  const stops: BundleStop[] = [];
  for (const [id, set] of stopRoutes) {
    const info = stopInfo.get(id);
    if (!info) continue;
    stops.push({ id, ...info, routes: [...set].map((r) => `${system.key}:${routes[r].id}`) });
  }

  // Only routes that actually run.
  const running = new Set(tripRoute.values());
  const kept = routes.filter((_, i) => running.has(i));
  return { agencies, urls, routes: kept, stops };
}

// ---------- Previous build (to keep systems whose feed failed) ----------

interface Meta {
  updated: string;
  systems: { key: string; name: string; live: boolean; credit?: string }[];
  /** [system, name, website] */
  agencies: [number, string, string?][];
  routes: [number, string, string, string, string, Mode][];
}

function previousBundles(): Map<string, Bundle> {
  const bundles = new Map<string, Bundle>();
  try {
    const meta: Meta = JSON.parse(readFileSync(join(OUT, 'meta.json'), 'utf8'));
    const routesGeo = JSON.parse(readFileSync(join(OUT, 'routes.json'), 'utf8'));
    const stops = JSON.parse(readFileSync(join(OUT, 'stops.json'), 'utf8')).stops as [number, number, string, number[], number, string][];
    const geomByRoute = new Map<number, number[][][]>();
    for (const f of routesGeo.features) geomByRoute.set(f.properties.i, f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates);
    const sysOfAgency = (a: number) => meta.systems[meta.agencies[a][0]].key;
    const routeKey = (r: number) => `${sysOfAgency(meta.routes[r][0])}:${meta.routes[r][1]}`;
    const agencyLocal = new Map<number, number>();
    const bundle = (key: string) => {
      let b = bundles.get(key);
      if (!b) bundles.set(key, (b = { agencies: [], urls: [], routes: [], stops: [] }));
      return b;
    };
    meta.agencies.forEach(([s, name, url], a) => {
      const b = bundle(meta.systems[s].key);
      agencyLocal.set(a, b.agencies.length);
      b.agencies.push(name);
      b.urls.push(url ?? '');
    });
    meta.routes.forEach(([a, id, short, long, color, mode], r) => {
      bundle(sysOfAgency(a)).routes.push({ agency: agencyLocal.get(a)!, id, short, long, color, mode, geom: geomByRoute.get(r) ?? [] });
    });
    // A merged stop goes back to every system whose routes serve it, with just that
    // system's routes, so keeping one system doesn't drop its routes from shared stops.
    for (const [lon, lat, name, routes, s, id] of stops) {
      const bySystem = new Map<string, string[]>([[meta.systems[s].key, []]]);
      for (const key of routes.map(routeKey)) {
        const sys = key.slice(0, key.indexOf(':'));
        if (!bySystem.has(sys)) bySystem.set(sys, []);
        bySystem.get(sys)!.push(key);
      }
      for (const [sys, keys] of bySystem) bundle(sys).stops.push({ id, name, lon, lat, routes: keys });
    }
  } catch {
    // First build, or the files changed shape: nothing to keep.
  }
  return bundles;
}

// ---------- Main ----------

async function main() {
  const previous = previousBundles();
  const report: Record<string, Report> = {};
  const bundles = new Map<string, Bundle>();
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  for (const [i, system] of systems.entries()) {
    if (!system.static?.length) continue;
    if (only && !only.has(system.key)) {
      const prev = previous.get(system.key);
      if (prev) bundles.set(system.key, prev);
      report[system.key] = { ok: false, kept: Boolean(prev), error: 'skipped (--only)' };
      continue;
    }
    const started = Date.now();
    const errors: string[] = [];
    const override = process.env.TRANSIT_STATIC_OVERRIDE ? JSON.parse(process.env.TRANSIT_STATIC_OVERRIDE)[system.key] : undefined;
    for (const url of override ? [override] : system.static) {
      const zip = join(TMP, `${system.key}.zip`);
      const dir = join(TMP, system.key);
      try {
        await download(url, zip);
        rmSync(dir, { recursive: true, force: true });
        const unzip = spawnSync('unzip', ['-o', '-qq', zip, '-d', dir]);
        if (unzip.status !== 0 && !existsSync(dir)) throw new Error(`unzip failed: ${unzip.stderr}`);
        const bundle = await readGtfs(system, dir, PALETTE[i % PALETTE.length]);
        if (!bundle.routes.length) throw new Error('no running routes');
        bundles.set(system.key, bundle);
        report[system.key] = {
          ok: true,
          source: url,
          agencies: bundle.agencies,
          routes: bundle.routes.length,
          routesWithGeometry: bundle.routes.filter((r) => r.geom.length).length,
          stops: bundle.stops.length,
          ms: Date.now() - started,
        };
        break;
      } catch (error) {
        errors.push(`${url}: ${(error as Error).message}`);
      } finally {
        rmSync(zip, { force: true });
        rmSync(dir, { recursive: true, force: true });
      }
    }
    if (!bundles.has(system.key)) {
      const prev = previous.get(system.key);
      if (prev) bundles.set(system.key, prev);
      report[system.key] = { ok: false, kept: Boolean(prev), error: errors.join(' | '), ms: Date.now() - started };
    }
    const r = report[system.key];
    console.log(`${r.ok ? 'ok  ' : r.kept ? 'kept' : 'FAIL'} ${system.key.padEnd(12)} ${r.ok ? `${r.routes} routes, ${r.stops} stops` : r.error}`);
  }
  rmSync(TMP, { recursive: true, force: true });

  // Merge: systems in list order; the first copy of a route (same agency name, route
  // name and mode) owns the geometry, later copies point stops at it.
  const meta: Meta = { updated: new Date().toISOString(), systems: [], agencies: [], routes: [] };
  const features: unknown[] = [];
  const routeIndex = new Map<string, number>(); // `${system}:${routeId}` -> canonical route
  const signatures = new Map<string, number>();
  const pendingStops: { system: number; stop: BundleStop }[] = [];

  for (const system of systems) {
    const s = meta.systems.length;
    meta.systems.push({ key: system.key, name: system.name, live: Boolean(system.live), ...(system.credit ? { credit: system.credit } : {}) });
    const b = bundles.get(system.key);
    if (!b) continue;
    const agencyBase = meta.agencies.length;
    b.agencies.forEach((name, a) => meta.agencies.push(b.urls[a] ? [s, name, b.urls[a]] : [s, name]));
    for (const r of [...b.routes].sort((x, y) => x.id.localeCompare(y.id, 'en', { numeric: true }))) {
      const idx = meta.routes.length;
      const agencyName = b.agencies[r.agency] ?? system.name;
      meta.routes.push([agencyBase + r.agency, r.id, r.short, r.long, r.color, r.mode]);
      const sig = `${agencyName.toLowerCase().replace(/[^a-z0-9]/g, '')}|${(r.short || r.long).toLowerCase()}|${r.mode}`;
      const canonical = signatures.get(sig);
      if (canonical !== undefined && meta.routes[canonical]) {
        routeIndex.set(`${system.key}:${r.id}`, canonical);
        continue;
      }
      signatures.set(sig, idx);
      routeIndex.set(`${system.key}:${r.id}`, idx);
      if (!r.geom.length) continue;
      features.push({
        type: 'Feature',
        properties: { i: idx, c: r.color, m: r.mode, n: r.short || r.long },
        geometry: r.geom.length === 1 ? { type: 'LineString', coordinates: r.geom[0] } : { type: 'MultiLineString', coordinates: r.geom },
      });
    }
    for (const stop of b.stops) pendingStops.push({ system: s, stop });
  }

  // Stops: merge copies of the same stop (same name within about 10 m) across feeds.
  const stopsOut: [number, number, string, number[], number, string][] = [];
  const stopKey = new Map<string, number>();
  pendingStops.sort((a, b) => a.system - b.system || a.stop.id.localeCompare(b.stop.id, 'en', { numeric: true }));
  for (const { system, stop } of pendingStops) {
    const routes = [...new Set(stop.routes.map((k) => routeIndex.get(k)).filter((r): r is number => r !== undefined))];
    const key = `${stop.name.toLowerCase()}|${stop.lon.toFixed(4)}|${stop.lat.toFixed(4)}`;
    const existing = stopKey.get(key);
    if (existing !== undefined) {
      const merged = new Set([...stopsOut[existing][3], ...routes]);
      stopsOut[existing][3] = [...merged].sort((a, b) => a - b);
      continue;
    }
    stopKey.set(key, stopsOut.length);
    stopsOut.push([stop.lon, stop.lat, stop.name, routes.sort((a, b) => a - b), system, stop.id]);
  }

  mkdirSync(OUT, { recursive: true });
  // Only bump `updated` when the data really changed, so a weekly run with no changes
  // doesn't make a commit.
  const routesJson = JSON.stringify({ type: 'FeatureCollection', features });
  const stopsJson = JSON.stringify({ stops: stopsOut });
  const metaBody = (m: Meta) => JSON.stringify({ ...m, updated: '' });
  let changed = true;
  try {
    const old = JSON.parse(readFileSync(join(OUT, 'meta.json'), 'utf8'));
    changed =
      metaBody(old) !== metaBody(meta) ||
      readFileSync(join(OUT, 'routes.json'), 'utf8') !== routesJson ||
      readFileSync(join(OUT, 'stops.json'), 'utf8') !== stopsJson;
    if (!changed) meta.updated = old.updated;
  } catch {}
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta));
  writeFileSync(join(OUT, 'routes.json'), routesJson);
  writeFileSync(join(OUT, 'stops.json'), stopsJson);
  if (changed || !existsSync(join(OUT, 'report.json'))) {
    writeFileSync(join(OUT, 'report.json'), JSON.stringify({ built: meta.updated, systems: report }, null, 1) + '\n');
  }

  const kb = (s: string) => `${Math.round(s.length / 1024)} KB`;
  console.log(`\n${features.length} route lines (${kb(routesJson)}), ${stopsOut.length} stops (${kb(stopsJson)}), ${meta.routes.length} routes. ${changed ? 'Changed.' : 'No changes.'}`);
}

await main();
