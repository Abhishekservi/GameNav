import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJourneyTrack, evaluateJourney, journeyStartError, maneuverInstruction } from '../src/routing/journey.ts';

const NOW = 1_000_000;
const a = [72.83, 19];
const b = [72.83, 19.0018];
const c = [72.8319, 19.0018];
const makeStep = (type, geometry, distance, modifier, name = 'Test Road') => ({ type, geometry, distance, duration: distance / 5, location: geometry[0], modifier, name });
const makeRoute = () => ({ origin: a, destination: c, start: a, end: c, startOffset: 0, endOffset: 0, distance: 400, duration: 80, calculatedAt: NOW, bounds: [72.83, 19, 72.8319, 19.0018], geometry: { type: 'LineString', coordinates: [a, b, c] }, steps: [makeStep('depart', [a, b], 200), makeStep('turn', [b, c], 200, 'right', 'Next Road'), makeStep('arrive', [c], 0)] });
const fix = (point, seconds = 0, overrides = {}) => ({ timestamp: NOW + seconds * 1000, coords: { longitude: point[0], latitude: point[1], accuracy: 10, speed: 0, heading: 0, ...overrides } });
const read = (track, point, seconds = 0, previous = null, overrides = {}) => evaluateJourney(track, fix(point, seconds, overrides), true, previous, NOW + seconds * 1000);

test('start requires a recent route, current precise GPS and a stopped vehicle', () => {
  const route = makeRoute();
  assert.equal(journeyStartError(route, fix(a), true, NOW), null);
  assert.match(journeyStartError(null, fix(a), true, NOW), /route first/);
  assert.match(journeyStartError(route, fix(a, 0, { accuracy: 36 }), true, NOW), /GPS/);
  assert.match(journeyStartError(route, fix(a), false, NOW), /GPS/);
  assert.match(journeyStartError(route, fix(a, -13), true, NOW), /GPS/);
  assert.match(journeyStartError(route, fix(a, 0, { speed: 3 }), true, NOW), /Stop safely/);
  assert.match(journeyStartError(route, fix(a, 301), true, NOW + 301000), /expired/);
  assert.match(journeyStartError(route, fix(c), true, NOW), /changed/);
});

test('uses actual turn, ramp, fork, U-turn and roundabout maneuvers', () => {
  const instruction = (type, modifier, exit) => maneuverInstruction({ ...makeStep(type, [a, b], 200, modifier), exit });
  assert.equal(instruction('turn', 'left').text, 'Turn left');
  assert.equal(instruction('turn', 'sharp right').text, 'Turn sharply right');
  assert.equal(instruction('turn', 'slight left').text, 'Bear left');
  assert.equal(instruction('turn', 'uturn').text, 'Make a U-turn');
  assert.equal(instruction('on ramp', 'right').text, 'Take the ramp right');
  assert.equal(instruction('off ramp', 'left').text, 'Take the exit left');
  assert.equal(instruction('fork', 'slight right').text, 'Keep right at the fork');
  assert.equal(instruction('roundabout', undefined, 3).text, 'At the roundabout, take exit 3');
  assert.equal(instruction('rotary').text, 'Continue around the roundabout');
  assert.equal(instruction('future maneuver', 'left').text, 'Turn left');
  assert.match(maneuverInstruction(makeStep('arrive', [c], 0), 100).text, /driving route/);
});

test('GPS progress counts down to a real turn, then advances to arrival', () => {
  const track = buildJourneyTrack(makeRoute());
  const start = read(track, a);
  assert.equal(start.status, 'tracking');
  assert.equal(start.remaining, 400);
  assert.equal(start.instruction.text, 'Turn right');
  assert.equal(start.instruction.distance, 200);
  const approach = read(track, [72.83, 19.0009], 10, start.progress);
  assert.ok(Math.abs(approach.instruction.distance - 100) < 1);
  const passed = read(track, [72.8304, 19.0018], 20, approach.progress, { speed: 5, heading: 90 });
  assert.equal(passed.progress.stepIndex, 1);
  assert.match(passed.instruction.text, /Arrive/);
  assert.ok(passed.remaining < 170);
});

test('weak, stale, invalid and out-of-order GPS pauses instructions and preserves accepted progress', () => {
  const track = buildJourneyTrack(makeRoute());
  const start = read(track, a);
  const samples = [fix(a, 1, { accuracy: 70 }), fix(a, -20), fix(a, 1, { latitude: NaN }), fix(a)];
  for (const sample of samples) {
    const paused = evaluateJourney(track, sample, true, start.progress, NOW + 1000);
    assert.equal(paused.status, 'waiting');
    assert.equal(paused.instruction, null);
    assert.equal(paused.remaining, null);
    assert.equal(paused.progress, start.progress);
  }
  const recovered = read(track, [72.83, 19.0004], 5, start.progress);
  assert.equal(recovered.status, 'tracking');
});

test('off-route positions hide prompts and can recover on the original route', () => {
  const track = buildJourneyTrack(makeRoute());
  const start = read(track, a);
  const off = read(track, [72.828, 19.0004], 5, start.progress);
  assert.equal(off.status, 'off-route');
  assert.equal(off.instruction, null);
  assert.equal(off.progress, start.progress);
  assert.equal(read(track, [72.83, 19.0004], 10, off.progress).status, 'tracking');
});

test('opposite course, implausible progress jumps and overlapping routes suppress guessing', () => {
  const track = buildJourneyTrack(makeRoute());
  const start = read(track, a);
  assert.equal(read(track, [72.83, 19.0004], 5, start.progress, { speed: 8, heading: 180 }).status, 'uncertain');
  assert.equal(read(track, c, 1, start.progress).status, 'uncertain');
  const route = makeRoute();
  route.end = a; route.destination = a; route.distance = 1000;
  route.steps = [makeStep('depart', [a, b], 500), makeStep('turn', [b, a], 500, 'uturn'), makeStep('arrive', [a], 0)];
  const loop = buildJourneyTrack(route);
  const initial = read(loop, a);
  assert.equal(initial.status, 'tracking');
  const ambiguous = read(loop, [72.83, 19.00054], 20, initial.progress);
  assert.equal(ambiguous.status, 'uncertain');
  assert.equal(ambiguous.instruction, null);
});

test('completion needs three distinct accurate stopped fixes at the road endpoint', () => {
  const route = makeRoute();
  route.destination = [72.8328, 19.0018]; route.endOffset = 95;
  const track = buildJourneyTrack(route);
  let reading = read(track, a);
  reading = read(track, [72.8304, 19.0018], 10, reading.progress);
  reading = read(track, c, 20, reading.progress, { speed: 4, heading: 90 });
  assert.equal(reading.status, 'tracking');
  assert.equal(reading.progress.arrivalCount, 0);
  reading = read(track, c, 21, reading.progress);
  assert.equal(reading.progress.arrivalCount, 1);
  reading = read(track, c, 22, reading.progress);
  assert.equal(reading.status, 'tracking');
  reading = read(track, c, 23, reading.progress);
  assert.equal(reading.status, 'complete');
  assert.ok(reading.distanceToPin > 90);
  assert.match(reading.instruction.text, /end of the driving route/);
});
