import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUsableFix, shortestAngle, speedKmh } from '../src/location/position.ts';

const now = 1_800_000_000_000;
const fix = (changes = {}, timestamp = now) => ({ timestamp, coords: { latitude: 18.9435, longitude: 72.8311, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: 0, speed: 10, ...changes } });

test('accepts recent real coordinates, including zero longitude or latitude', () => {
  assert.equal(isUsableFix(fix(), now), true);
  assert.equal(isUsableFix(fix({ longitude: 0, latitude: 0 }), now), true);
});
test('rejects stale, future, inaccurate, and malformed fixes', () => {
  for (const value of [fix({}, now - 12_001), fix({}, now + 2001), fix({ accuracy: 101 }), fix({ accuracy: null }), fix({ longitude: NaN }), fix({ latitude: 91 }), fix({ longitude: 181 })]) assert.equal(isUsableFix(value, now), false);
});
test('converts measured speed to km/h; never invents unavailable or stale speed', () => {
  assert.equal(speedKmh(fix(), true), 36);
  assert.equal(speedKmh(fix({ speed: 0 }), true), 0);
  for (const value of [null, fix({ speed: null }), fix({ speed: -1 }), fix({ speed: NaN })]) assert.equal(speedKmh(value, true), null);
  assert.equal(speedKmh(fix(), false), null);
});
test('heading crosses north by the shortest arc', () => {
  assert.equal(shortestAngle(359, 1), 361);
  assert.equal(shortestAngle(1, 359), -1);
  assert.equal(shortestAngle(1080, 1), 1081);
  assert.equal(shortestAngle(-1080, 359), -1081);
});
