/*
  What a live vehicle actually is, for the transit map's popups, with a small side-view
  drawing of it. The live feeds only send a number: Washington State Ferries sends its
  vessel id, King County Metro its fleet number.

  Ferries: from WSDOT's vessel pages (wsdot.com/ferries/vesselwatch, November 2026). The
  ids match WSDOT's VesselID, which is what the OneBusAway feed sends.
  Buses: King County Metro's fleet roster (Wikipedia, "King County Metro fleet", and
  Pantograph's vehicle list, November 2026).

  The drawings are generic illustrations of each kind of vessel and bus, not likenesses.
*/

export interface Vessel {
  name: string;
  cls: FerryClass;
  built: string;
  feet: number;
  cars: number;
  people: number;
}

type FerryClass = 'Jumbo Mark II' | 'Jumbo' | 'Super' | 'Olympic' | 'Issaquah' | 'Evergreen State' | 'Kwa-di Tabil';

export const VESSELS: Record<string, Vessel> = {
  '1': { name: 'Cathlamet', cls: 'Issaquah', built: '1981, rebuilt 1993', feet: 328, cars: 124, people: 1196 },
  '2': { name: 'Chelan', cls: 'Issaquah', built: '1981, rebuilt 2005', feet: 328, cars: 124, people: 1196 },
  '15': { name: 'Issaquah', cls: 'Issaquah', built: '1979, rebuilt 1989', feet: 328, cars: 124, people: 1196 },
  '17': { name: 'Kaleetan', cls: 'Super', built: '1967, rebuilt 1999', feet: 382, cars: 144, people: 1195 },
  '18': { name: 'Kitsap', cls: 'Issaquah', built: '1980, rebuilt 1992', feet: 328, cars: 124, people: 1196 },
  '19': { name: 'Kittitas', cls: 'Issaquah', built: '1980, rebuilt 1990', feet: 328, cars: 124, people: 1196 },
  '25': { name: 'Puyallup', cls: 'Jumbo Mark II', built: '1999', feet: 460, cars: 202, people: 1791 },
  '28': { name: 'Sealth', cls: 'Issaquah', built: '1982', feet: 328, cars: 90, people: 1196 },
  '30': { name: 'Spokane', cls: 'Jumbo', built: '1972, rebuilt 2004', feet: 440, cars: 188, people: 1793 },
  '32': { name: 'Tacoma', cls: 'Jumbo Mark II', built: '1997', feet: 460, cars: 202, people: 1791 },
  '33': { name: 'Tillikum', cls: 'Evergreen State', built: '1959, rebuilt 1994', feet: 310, cars: 87, people: 596 },
  '36': { name: 'Walla Walla', cls: 'Jumbo', built: '1973, rebuilt 2005', feet: 440, cars: 188, people: 1793 },
  '37': { name: 'Wenatchee', cls: 'Jumbo Mark II', built: '1998, rebuilt 2025', feet: 460, cars: 202, people: 1791 },
  '38': { name: 'Yakima', cls: 'Super', built: '1967, rebuilt 2000', feet: 382, cars: 144, people: 1195 },
  '52': { name: 'Kennewick', cls: 'Kwa-di Tabil', built: '2011', feet: 274, cars: 64, people: 748 },
  '65': { name: 'Chetzemoka', cls: 'Kwa-di Tabil', built: '2010', feet: 274, cars: 64, people: 748 },
  '66': { name: 'Salish', cls: 'Kwa-di Tabil', built: '2011', feet: 274, cars: 64, people: 748 },
  '68': { name: 'Tokitae', cls: 'Olympic', built: '2014', feet: 362, cars: 144, people: 1500 },
  '69': { name: 'Samish', cls: 'Olympic', built: '2015', feet: 362, cars: 144, people: 1500 },
  '74': { name: 'Chimacum', cls: 'Olympic', built: '2017', feet: 362, cars: 144, people: 1500 },
  '75': { name: 'Suquamish', cls: 'Olympic', built: '2018', feet: 362, cars: 144, people: 1500 },
};

type Power = 'hybrid' | 'trolley' | 'battery';
export interface BusModel {
  model: string;
  feet: 35 | 40 | 60;
  power: Power;
  years: string;
  note?: string;
}

const KCM: [from: number, to: number, bus: BusModel][] = [
  [1000, 1067, { model: 'Gillig Low Floor EV Plus', feet: 40, power: 'battery', years: '2024–25' }],
  [3700, 3759, { model: 'New Flyer Xcelsior XDE35', feet: 35, power: 'hybrid', years: '2013–14' }],
  [4300, 4409, { model: 'New Flyer Xcelsior XT40', feet: 40, power: 'trolley', years: '2014–15' }],
  [4500, 4563, { model: 'New Flyer Xcelsior XT60', feet: 60, power: 'trolley', years: '2015–16' }],
  [4700, 4719, { model: 'New Flyer Xcelsior XE40', feet: 40, power: 'battery', years: '2021' }],
  [4800, 4819, { model: 'New Flyer Xcelsior XE60', feet: 60, power: 'battery', years: '2021' }],
  [4840, 4859, { model: 'New Flyer Xcelsior CHARGE XE60', feet: 60, power: 'battery', years: 'new' }],
  [6000, 6019, { model: 'New Flyer DE60LFA', feet: 60, power: 'hybrid', years: '2009', note: 'RapidRide' }],
  [6020, 6117, { model: 'New Flyer DE60LFR', feet: 60, power: 'hybrid', years: '2011–13', note: 'RapidRide' }],
  [6200, 6289, { model: 'New Flyer Xcelsior XDE60', feet: 60, power: 'hybrid', years: '2015–19', note: 'RapidRide' }],
  [6400, 6412, { model: 'New Flyer Xcelsior XDE60', feet: 60, power: 'hybrid', years: '2023', note: 'RapidRide G Line, with doors on both sides' }],
  [6500, 6521, { model: 'Gillig Low Floor EV Plus', feet: 40, power: 'battery', years: '2025', note: 'RapidRide' }],
  [6800, 6800, { model: 'New Flyer DE60LFR', feet: 60, power: 'hybrid', years: '2010–13' }],
  [6813, 6865, { model: 'New Flyer DE60LF', feet: 60, power: 'hybrid', years: '2008–09' }],
  [6866, 6999, { model: 'New Flyer DE60LFR', feet: 60, power: 'hybrid', years: '2010–13' }],
  [7001, 7199, { model: 'Orion VII', feet: 40, power: 'hybrid', years: '2010–12' }],
  [7200, 7259, { model: 'New Flyer Xcelsior XDE40', feet: 40, power: 'hybrid', years: '2015' }],
  [7300, 7494, { model: 'Gillig Low Floor', feet: 40, power: 'hybrid', years: '2017–19' }],
  [8000, 8299, { model: 'New Flyer Xcelsior XDE60', feet: 60, power: 'hybrid', years: '2015–18' }],
];

export function kcmBus(fleetNumber: string): BusModel | undefined {
  const n = Number(fleetNumber);
  if (!Number.isInteger(n)) return undefined;
  return KCM.find(([from, to]) => n >= from && n <= to)?.[2];
}

export const POWER_WORDS: Record<Power, string> = {
  hybrid: 'diesel-electric hybrid',
  trolley: 'electric trolleybus',
  battery: 'battery electric',
};

// ---------- Drawings ----------

const WSF_GREEN = '#0b6b47';

/** A double-ended ferry in side view, sized and shaped by class. */
export function ferrySvg(cls: FerryClass): string {
  const spec: Record<FerryClass, { len: number; tiers: number; stacks: number; tall?: boolean }> = {
    'Jumbo Mark II': { len: 236, tiers: 2, stacks: 2 },
    Jumbo: { len: 226, tiers: 2, stacks: 2 },
    Super: { len: 200, tiers: 2, stacks: 1, tall: true },
    Olympic: { len: 190, tiers: 2, stacks: 1 },
    Issaquah: { len: 172, tiers: 1, stacks: 1 },
    'Evergreen State': { len: 164, tiers: 1, stacks: 1 },
    'Kwa-di Tabil': { len: 146, tiers: 1, stacks: 1 },
  };
  const { len, tiers, stacks, tall } = spec[cls];
  const x0 = (260 - len) / 2;
  const x1 = x0 + len;
  const water = 64;
  const deck = 44; // top of the car deck
  const tierH = tall ? 11 : 9;
  const houseInset = len * 0.16;
  let s = `<svg viewBox="0 -12 260 96" class="tm-vehicle-art" aria-hidden="true">`;
  // water
  s += `<path d="M0 ${water + 4}h260v20H0z" fill="#9fc6dc" opacity=".55"/>`;
  s += `<path d="M10 ${water + 9}q8-3 16 0t16 0M120 ${water + 12}q8-3 16 0t16 0M200 ${water + 8}q8-3 16 0t16 0" stroke="#fff" stroke-width="1.5" fill="none" opacity=".7"/>`;
  // hull: green below, white car deck above
  s += `<path d="M${x0} ${deck}h${len}l-8 ${water - deck + 2}H${x0 + 8}z" fill="${WSF_GREEN}"/>`;
  s += `<path d="M${x0 - 2} ${deck - 14}h${len + 4}v14H${x0 - 2}z" fill="#fff" stroke="#c9d3da"/>`;
  s += `<path d="M${x0 - 2} ${deck - 3}h${len + 4}" stroke="${WSF_GREEN}" stroke-width="3"/>`;
  // car deck openings
  for (let x = x0 + 10; x < x1 - 14; x += 14) s += `<rect x="${x}" y="${deck - 11}" width="9" height="5" rx="1" fill="#5b6a74"/>`;
  // passenger tiers
  let top = deck - 14;
  for (let t = 0; t < tiers; t++) {
    const inset = houseInset + t * len * 0.06;
    const y = top - tierH;
    s += `<path d="M${x0 + inset} ${top}h${len - inset * 2}l-3 ${-tierH}H${x0 + inset + 3}z" fill="#fff" stroke="#c9d3da"/>`;
    for (let x = x0 + inset + 6; x < x1 - inset - 8; x += 8) s += `<rect x="${x}" y="${y + 3}" width="5" height="${tierH - 6}" rx="1" fill="#2c3e4c"/>`;
    top = y;
  }
  // wheelhouses at both ends, stacks in the middle
  const wh = len * 0.1;
  s += `<rect x="${x0 + houseInset - 2}" y="${top - 7}" width="${wh}" height="7" rx="1.5" fill="#fff" stroke="#c9d3da"/>`;
  s += `<rect x="${x1 - houseInset + 2 - wh}" y="${top - 7}" width="${wh}" height="7" rx="1.5" fill="#fff" stroke="#c9d3da"/>`;
  const mid = (x0 + x1) / 2;
  for (let k = 0; k < stacks; k++) {
    const sx = stacks === 1 ? mid - 7 : mid - 22 + k * 30;
    s += `<path d="M${sx} ${top}h14l-1.5 -17h-11z" fill="#fff" stroke="#c9d3da"/><path d="M${sx + 1.5} ${top - 13}h11" stroke="${WSF_GREEN}" stroke-width="4"/>`;
  }
  return s + '</svg>';
}

/** A bus in side view: 35, 40 or 60 feet, with trolley poles or a battery pack. */
export function busSvg(bus: Pick<BusModel, 'feet' | 'power'>, color: string): string {
  const len = bus.feet === 60 ? 228 : bus.feet === 40 ? 168 : 148;
  const x0 = (260 - len) / 2;
  const top = 26;
  const floor = 60;
  let s = `<svg viewBox="0 0 260 84" class="tm-vehicle-art" aria-hidden="true">`;
  s += `<path d="M0 ${floor + 10}h260" stroke="#b9bec4" stroke-width="2"/>`;
  if (bus.power === 'trolley') {
    // Poles trail back from the roof toward the rear (the bus faces right).
    s += `<path d="M${x0 + len * 0.62} ${top}L${x0 + len * 0.22} 6M${x0 + len * 0.58} ${top}L${x0 + len * 0.18} 4" stroke="#3a3f45" stroke-width="2" stroke-linecap="round"/>`;
  }
  if (bus.power === 'battery') {
    s += `<rect x="${x0 + len * 0.3}" y="${top - 5}" width="${len * 0.4}" height="5" rx="2" fill="#d5dade"/>`;
    s += `<path d="M${x0 + len * 0.5 + 1} ${top - 4.5}l-3 2.5h2.5l-2 2.5" stroke="#3a3f45" stroke-width="1.2" fill="none"/>`;
  }
  const body = (bx: number, bl: number, frontRound: boolean, backRound: boolean) => {
    const r = 6;
    s += `<path d="M${bx + (backRound ? r : 0)} ${top}H${bx + bl - (frontRound ? 10 : 0)}${frontRound ? `q10 0 10 10` : ''}V${floor}H${bx}V${top + (backRound ? r : 0)}${backRound ? `q0-${r} ${r}-${r}` : ''}z" fill="#f8f9fa" stroke="#aab2b9"/>`;
    s += `<path d="M${bx} ${floor - 12}h${bl}v6H${bx}z" fill="${color}"/>`;
    for (let x = bx + 8; x < bx + bl - 22; x += 15) s += `<rect x="${x}" y="${top + 5}" width="12" height="13" rx="1.5" fill="#2c3e4c"/>`;
  };
  if (bus.feet === 60) {
    const front = len * 0.56;
    body(x0, len - front - 4, false, true);
    s += `<rect x="${x0 + len - front - 5}" y="${top + 2}" width="7" height="${floor - top - 2}" fill="#4b5157"/>`;
    for (let y = top + 5; y < floor; y += 4) s += `<path d="M${x0 + len - front - 5} ${y}h7" stroke="#6b7278"/>`;
    body(x0 + len - front + 2, front - 2, true, false);
  } else {
    body(x0, len, true, true);
  }
  // windshield and door
  s += `<path d="M${x0 + len - 9} ${top + 4}q7 1 7 10v6h-7z" fill="#2c3e4c"/>`;
  s += `<rect x="${x0 + len - 26}" y="${top + 4}" width="12" height="${floor - top - 6}" rx="1" fill="#5b6a74"/>`;
  // wheels
  const axles = bus.feet === 60 ? [0.12, 0.42, 0.85] : [0.18, 0.8];
  for (const a of axles) s += `<circle cx="${x0 + len * a}" cy="${floor + 2}" r="7.5" fill="#2b2f33"/><circle cx="${x0 + len * a}" cy="${floor + 2}" r="3" fill="#9aa1a7"/>`;
  return s + '</svg>';
}
