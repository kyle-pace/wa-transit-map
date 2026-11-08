/*
  A tiny GTFS-realtime reader: just enough protobuf to pull vehicle positions out of a
  FeedMessage, with no dependencies. Fields we don't need are skipped without decoding.
  Written as flat loops over one buffer (no per-field objects or closures) because it
  runs inside a Worker's small CPU budget for every feed in the state.
  Spec: https://gtfs.org/documentation/realtime/proto/
*/

export interface VehiclePosition {
  id: string;
  label: string;
  routeId: string;
  tripId: string;
  directionId: number | null;
  lat: number;
  lon: number;
  bearing: number | null;
  /** Meters per second. */
  speed: number | null;
  /** Seconds since the epoch (0 when the feed leaves it out). */
  timestamp: number;
  stopId: string;
  /** 0 incoming at, 1 stopped at, 2 in transit to. */
  status: number | null;
}

export interface FeedMessage {
  timestamp: number;
  vehicles: VehiclePosition[];
}

const utf8 = new TextDecoder();

let buf: Uint8Array;
let view: DataView;
let pos = 0;

function varint(): number {
  // Values here (timestamps, enums, lengths) fit in 2^53.
  let b = buf[pos++];
  if (b < 0x80) return b;
  let result = b & 0x7f;
  let shift = 128;
  for (let i = 1; i < 10; i++) {
    b = buf[pos++];
    result += (b & 0x7f) * shift;
    if (b < 0x80) return result;
    shift *= 128;
  }
  throw new Error('bad varint');
}

function str(end: number): string {
  // Ids and labels are nearly always ASCII; skip TextDecoder for those.
  const start = pos;
  let s = '';
  for (let i = start; i < end; i++) {
    const c = buf[i];
    if (c >= 0x80) {
      pos = end;
      return utf8.decode(buf.subarray(start, end));
    }
    s += String.fromCharCode(c);
  }
  pos = end;
  return s;
}

function skip(wire: number) {
  if (wire === 0) varint();
  else if (wire === 2) {
    // Read the length first: `pos += varint()` would use pos from before the read.
    const len = varint();
    pos += len;
  }
  else if (wire === 5) pos += 4;
  else if (wire === 1) pos += 8;
  else throw new Error(`unsupported wire type ${wire}`);
}

function readVehicle(end: number, entityId: string): VehiclePosition | null {
  let id = entityId, label = '', routeId = '', tripId = '', stopId = '';
  let directionId: number | null = null, bearing: number | null = null, speed: number | null = null, status: number | null = null;
  let lat = NaN, lon = NaN, timestamp = 0;

  while (pos < end) {
    const tag = varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 2 && (field === 1 || field === 2 || field === 8)) {
      const subEnd = varint() + pos;
      while (pos < subEnd) {
        const t = varint();
        const f = t >>> 3;
        const w = t & 7;
        if (field === 1) {
          // TripDescriptor
          if (w === 2 && f === 1) tripId = str(varint() + pos);
          else if (w === 2 && f === 5) routeId = str(varint() + pos);
          else if (w === 0 && f === 6) directionId = varint();
          else skip(w);
        } else if (field === 2) {
          // Position
          if (w === 5 && f <= 5 && f !== 4) {
            const v = view.getFloat32(pos, true);
            pos += 4;
            if (f === 1) lat = v;
            else if (f === 2) lon = v;
            else if (f === 3) bearing = v;
            else speed = v;
          } else if (w === 1 && (f === 1 || f === 2)) {
            // A few feeds wrongly send doubles.
            const v = view.getFloat64(pos, true);
            pos += 8;
            if (f === 1) lat = v;
            else lon = v;
          } else skip(w);
        } else {
          // VehicleDescriptor
          if (w === 2 && f === 1) {
            const v = str(varint() + pos);
            if (v) id = v;
          } else if (w === 2 && f === 2) label = str(varint() + pos);
          else skip(w);
        }
      }
      pos = subEnd;
    } else if (wire === 0 && field === 4) status = varint();
    else if (wire === 0 && field === 5) timestamp = varint();
    else if (wire === 2 && field === 7) stopId = str(varint() + pos);
    else skip(wire);
  }
  pos = end;

  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) || (lat === 0 && lon === 0)) return null;
  return { id, label, routeId, tripId, directionId, lat, lon, bearing, speed, timestamp, stopId, status };
}

export function decodeFeed(data: Uint8Array): FeedMessage {
  buf = data;
  view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  pos = 0;
  const out: FeedMessage = { timestamp: 0, vehicles: [] };
  const end = data.length;

  while (pos < end) {
    const tag = varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire !== 2 || (field !== 1 && field !== 2)) {
      skip(wire);
      continue;
    }
    const subEnd = varint() + pos;
    if (subEnd > end) throw new Error('truncated feed');
    if (field === 1) {
      // FeedHeader: just the timestamp.
      while (pos < subEnd) {
        const t = varint();
        if (t === 24) out.timestamp = varint();
        else skip(t & 7);
      }
    } else {
      // FeedEntity: the id (usually first), then the vehicle if there is one.
      let entityId = '';
      while (pos < subEnd) {
        const t = varint();
        if (t === 10) entityId = str(varint() + pos);
        else if (t === 34) {
          const v = readVehicle(varint() + pos, entityId);
          if (v) out.vehicles.push(v);
        } else skip(t & 7);
      }
    }
    pos = subEnd;
  }
  return out;
}
