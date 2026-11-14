// Tests for the weekly data job (scripts/build-transit.ts). Run with `npm test`.
//
// They run the real script against saved files instead of the agencies' servers:
//   samples/guemes-island-ferry.zip  a real schedule, saved 2026-11-14 (the smallest feed in the state)
// and broken versions made from it here. Output goes to a temp folder (TRANSIT_OUT), never public/transit/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sample = join(root, 'tests/samples/guemes-island-ferry.zip');
const scratch = mkdtempSync(join(tmpdir(), 'transit-test-'));
test.after(() => rmSync(scratch, { recursive: true, force: true }));

// Runs the build for the Guemes ferry only, reading `feed` (a file) in place of the download.
function build(out, feed) {
  const run = spawnSync(process.execPath, ['scripts/build-transit.ts', '--only', 'guemes'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, TRANSIT_OUT: out, TRANSIT_STATIC_OVERRIDE: JSON.stringify({ guemes: pathToFileURL(feed).href }) },
  });
  const read = (name) => JSON.parse(readFileSync(join(out, name), 'utf8'));
  return { status: run.status, log: run.stdout + run.stderr, read };
}

// A copy of the real feed with `change(dir)` applied to its unzipped files.
function brokenCopy(name, change) {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  assert.equal(spawnSync('unzip', ['-o', '-qq', sample, '-d', dir]).status, 0, 'unzip the sample');
  change(dir);
  const zip = join(scratch, `${name}.zip`);
  assert.equal(spawnSync('zip', ['-q', '-r', zip, '.'], { cwd: dir }).status, 0, 'zip the changed feed');
  return zip;
}

// Washington, with room to spare.
const inWashington = ([lon, lat]) => lon > -125.5 && lon < -116 && lat > 45 && lat < 49.5;

test('a real schedule becomes routes, lines and stops', () => {
  const out = join(scratch, 'good');
  const { status, log, read } = build(out, sample);
  assert.equal(status, 0, log);

  const meta = read('meta.json');
  // meta.systems always lists every system; the agencies are what this build really read.
  assert.deepEqual(meta.agencies.map(([system, name]) => [meta.systems[system].key, name]), [['guemes', 'Guemes Island Ferry']]);
  assert.ok(meta.routes.length >= 1, 'has a route');
  assert.equal(meta.routes[0][5], 'ferry', 'the route is a ferry');

  const lines = read('routes.json').features;
  assert.ok(lines.length >= 1, 'has a line to draw');
  for (const line of lines) {
    const points = line.geometry.type === 'LineString' ? line.geometry.coordinates : line.geometry.coordinates.flat();
    assert.ok(points.length >= 2 && points.every(inWashington), 'every point of the line is in Washington');
  }

  const stops = read('stops.json').stops;
  assert.equal(stops.length, 2, 'the ferry has two landings');
  for (const [lon, lat, name, routes] of stops) {
    assert.ok(inWashington([lon, lat]), `${name} is in Washington`);
    assert.ok(name && routes.length >= 1, 'each stop has a name and a route');
  }
  assert.equal(read('report.json').systems.guemes.ok, true);
});

test('a feed that is not a zip keeps the last good data and fails out loud', () => {
  const out = join(scratch, 'kept');
  assert.equal(build(out, sample).status, 0);
  const before = ['meta.json', 'routes.json', 'stops.json'].map((name) => readFileSync(join(out, name), 'utf8'));

  const notAZip = join(scratch, 'error-page.zip');
  writeFileSync(notAZip, '<html><body>503 Service Unavailable</body></html>');
  const { status, log } = build(out, notAZip);

  assert.equal(status, 1, 'the run goes red when everything it tried failed');
  assert.match(log, /kept\s+guemes/, 'the log says the old data was kept');
  const after = ['meta.json', 'routes.json', 'stops.json'].map((name) => readFileSync(join(out, name), 'utf8'));
  assert.deepEqual(after, before, 'the published files are exactly as they were');
});

test('a zip with no routes in it is treated the same way', () => {
  const out = join(scratch, 'no-routes');
  assert.equal(build(out, sample).status, 0);
  const before = readFileSync(join(out, 'stops.json'), 'utf8');

  const empty = brokenCopy('no-routes-feed', (dir) => writeFileSync(join(dir, 'routes.txt'), 'route_id,route_short_name,route_long_name,route_type\n'));
  const { status } = build(out, empty);

  assert.equal(status, 1);
  assert.equal(readFileSync(join(out, 'stops.json'), 'utf8'), before, 'stops are untouched');
});

test('one bad row does not take the rest of the feed down', () => {
  const out = join(scratch, 'bad-rows');
  const messy = brokenCopy('bad-rows-feed', (dir) => {
    // A stop with no position, a stop at 0,0, and a line of junk.
    appendFileSync(join(dir, 'stops.txt'), '\nghost-1,,Ghost landing,,,,,,,\nghost-2,,Null Island,,0,0,,,,\n"unclosed quote, and then nothing\n');
    appendFileSync(join(dir, 'stop_times.txt'), '\nnot,a,real,row\n');
  });
  const { status, log, read } = build(out, messy);

  assert.equal(status, 0, log);
  const stops = read('stops.json').stops;
  assert.equal(stops.length, 2, 'only the two real landings are kept');
  assert.ok(stops.every(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && inWashington([lon, lat])), 'no stop without a real position');
  assert.ok(read('meta.json').routes.length >= 1, 'the route is still there');
});
