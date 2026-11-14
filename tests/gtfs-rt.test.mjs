// Tests for the live-position reader (src/lib/gtfs-rt.ts), which decodes what agencies'
// servers send on every request. samples/island-transit-vehicles.pb is a real feed saved
// 2026-11-14.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeFeed } from '../src/lib/gtfs-rt.ts';

const real = new Uint8Array(readFileSync(new URL('./samples/island-transit-vehicles.pb', import.meta.url)));

test('a real feed decodes to vehicles with real positions', () => {
  const feed = decodeFeed(real);
  assert.ok(feed.timestamp > 1_700_000_000, 'the feed says when it was made');
  assert.ok(feed.vehicles.length >= 1, 'it has at least one vehicle');
  for (const v of feed.vehicles) {
    assert.ok(v.id, 'each vehicle has an id');
    assert.ok(Number.isFinite(v.lat) && Number.isFinite(v.lon), 'and a position');
    assert.ok(v.lat > 45 && v.lat < 49.5 && v.lon > -125.5 && v.lon < -116, `${v.id} is in Washington`);
  }
});

test('an empty answer is an empty feed, not a crash', () => {
  assert.deepEqual(decodeFeed(new Uint8Array(0)), { timestamp: 0, vehicles: [] });
});

test('a feed cut off halfway throws instead of returning half a bus', () => {
  assert.throws(() => decodeFeed(real.slice(0, Math.floor(real.length / 2))));
});

test('an error page instead of a feed never hangs and never invents vehicles', () => {
  const page = new TextEncoder().encode('<html><body><h1>502 Bad Gateway</h1></body></html>');
  let vehicles = [];
  try {
    vehicles = decodeFeed(page).vehicles;
  } catch {
    return; // throwing is fine: the caller skips that one agency
  }
  assert.deepEqual(vehicles, []);
});
