/*
  Live vehicle positions for the transit map (/transit/): fetches every GTFS-realtime
  feed in src/lib/transit-feeds.ts at once, decodes them (src/lib/gtfs-rt.ts) and merges
  them into one compact JSON answer. The only code that talks to the agencies' live feeds.

  Answer shape (arrays, not objects, to keep it small; the page knows the order):
  {
    t: server time (epoch seconds),
    feeds: [[key, ok, vehicles, feed age in seconds | null, error | null], ...],
    v: [[feed index, id, lon, lat, bearing | null, route id, label, timestamp, speed m/s | null,
         status | null, stop id], ...]
  }
*/
import { decodeFeed } from './gtfs-rt';
import { systems } from './transit-feeds';

const USER_AGENT = 'kylepace.dev transit map (https://kylepace.dev/transit/)';
/** Positions older than this are parked or lost buses; leave them off the map. */
const MAX_AGE_SECONDS = 15 * 60;
const TIMEOUT_MS = 6000;

export type FeedStatus = [key: string, ok: boolean, vehicles: number, age: number | null, error: string | null];
export type Vehicle = [
  feed: number,
  id: string,
  lon: number,
  lat: number,
  bearing: number | null,
  route: string,
  label: string,
  timestamp: number,
  speed: number | null,
  status: number | null,
  stop: string,
];

export interface LiveVehicles {
  t: number;
  feeds: FeedStatus[];
  v: Vehicle[];
}

const live = systems.filter((s) => s.live);
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export async function getLiveVehicles(obaKey: string): Promise<LiveVehicles> {
  const now = Math.floor(Date.now() / 1000);
  const out: LiveVehicles = { t: now, feeds: [], v: [] };

  const results = await Promise.allSettled(
    live.map(async (system) => {
      const url = system.live!.replace('{oba}', encodeURIComponent(obaKey));
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/x-protobuf, application/octet-stream, */*' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes[0] === 0x3c || bytes[0] === 0x7b) throw new Error('not protobuf (HTML or JSON answer)');
      return decodeFeed(bytes);
    }),
  );

  results.forEach((result, i) => {
    const key = live[i].key;
    if (result.status === 'rejected') {
      const err = result.reason instanceof Error ? result.reason.message : String(result.reason);
      out.feeds.push([key, false, 0, null, err.slice(0, 120)]);
      return;
    }
    const feed = result.value;
    let count = 0;
    for (const v of feed.vehicles) {
      const ts = v.timestamp || feed.timestamp;
      if (ts && now - ts > MAX_AGE_SECONDS) continue;
      count++;
      out.v.push([
        i,
        v.id,
        round5(v.lon),
        round5(v.lat),
        v.bearing === null ? null : Math.round(v.bearing),
        v.routeId,
        v.label,
        ts,
        v.speed === null ? null : Math.round(v.speed * 10) / 10,
        v.status,
        v.stopId,
      ]);
    }
    out.feeds.push([key, true, count, feed.timestamp ? now - feed.timestamp : null, null]);
  });

  return out;
}
