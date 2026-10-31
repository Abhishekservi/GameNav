import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoutingClient, distanceBetween, formatDistance, formatDuration, parseRoute } from '../src/routing/routes.ts';

const origin = [72.8346, 18.9220];
const destination = [72.8232, 18.9434];
const payload = () => ({ code: 'Ok', routes: [{ distance: 4100, duration: 875, geometry: { type: 'LineString', coordinates: [origin, [72.83, 18.93], destination] } }], waypoints: [{ location: origin, distance: 0 }, { location: destination, distance: 0 }] });
const response = value => new Response(JSON.stringify(value));
const makeClient = (fetcher, options = {}) => createRoutingClient({ endpoint: 'https://routing.example/route/v1/driving/?key=public', minimumIntervalMs: 0, fetcher, ...options });

test('parses real road geometry, meters, seconds, endpoints, and camera bounds', () => {
  const route = parseRoute(payload(), origin, destination, 123);
  assert.equal(route.distance, 4100);
  assert.equal(route.duration, 875);
  assert.equal(route.calculatedAt, 123);
  assert.deepEqual(route.geometry.coordinates, [origin, [72.83, 18.93], destination]);
  assert.deepEqual(route.bounds, [72.8232, 18.922, 72.8346, 18.9434]);
  assert.equal(route.startOffset, 0);
  assert.equal(route.endOffset, 0);
});

test('rejects no-route and no-road responses without inventing a straight line', () => {
  for (const code of ['NoRoute', 'NoSegment']) assert.throws(() => parseRoute({ code }, origin, destination), error => error.code === 'no-route');
  assert.throws(() => parseRoute({ code: 'InvalidQuery' }, origin, destination), error => error.code === 'response');
});

test('rejects malformed geometry, invalid estimates, and missing waypoints', () => {
  const changes = [
    p => { p.routes[0].geometry.type = 'Point'; },
    p => { p.routes[0].geometry.coordinates = [origin]; },
    p => { p.routes[0].geometry.coordinates[1] = [NaN, 99]; },
    p => { p.routes[0].distance = -10; },
    p => { p.routes[0].duration = Infinity; },
    p => { p.waypoints = []; },
    p => { p.waypoints[0].distance = -5; },
  ];
  for (const change of changes) { const value = payload(); change(value); assert.throws(() => parseRoute(value, origin, destination), error => error.code === 'response'); }
});

test('rejects distant road snaps and geometry unrelated to snapped endpoints', () => {
  const distant = payload(); distant.waypoints[0].distance = 800;
  assert.throws(() => parseRoute(distant, origin, destination), error => error.code === 'no-route');
  const wrong = payload(); wrong.routes[0].geometry.coordinates[0] = [72.8, 18.9];
  assert.throws(() => parseRoute(wrong, origin, destination), error => error.code === 'response');
});

test('formats route estimates without presenting a live ETA', () => {
  assert.equal(formatDistance(4100), '4.1 km');
  assert.equal(formatDistance(132), '140 m');
  assert.equal(formatDuration(875), '15 min');
  assert.equal(formatDuration(3601), '1 hr 1 min');
  assert.equal(distanceBetween(origin, origin), 0);
  assert.ok(distanceBetween(origin, destination) > 2000);
});

test('uses a car route endpoint with GeoJSON, preserves public parameters, and caches requests', async () => {
  let calls = 0;
  let url;
  let headers;
  const client = makeClient(async (value, options) => { calls++; url = new URL(value); headers = options.headers; return response(payload()); });
  await client.route(origin, destination);
  await client.route(origin, destination);
  assert.equal(calls, 1);
  assert.match(url.pathname, /route\/v1\/driving\/72\.834600,18\.922000;72\.823200,18\.943400$/);
  assert.equal(url.searchParams.get('geometries'), 'geojson');
  assert.equal(url.searchParams.get('overview'), 'full');
  assert.equal(url.searchParams.get('radiuses'), '500;500');
  assert.equal(url.searchParams.get('key'), 'public');
  assert.match(headers['User-Agent'], /^GameNav\//);
});

test('expires route cache rather than keeping old travel estimates indefinitely', async () => {
  let clock = 1000;
  let calls = 0;
  const client = makeClient(async () => { calls++; return response(payload()); }, { now: () => clock });
  await client.route(origin, destination);
  clock += 5 * 60_000 + 1;
  await client.route(origin, destination);
  assert.equal(calls, 2);
});

test('rejects invalid inputs and insecure routing config without network calls', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return response(payload()); };
  await assert.rejects(makeClient(fetcher).route([Infinity, 18], destination), error => error.code === 'coordinates');
  await assert.rejects(makeClient(fetcher, { endpoint: 'http://routing.example/' }).route(origin, destination), error => error.code === 'configuration');
  assert.equal(calls, 0);
});

test('handles offline, HTTP failure, malformed JSON, and OSRM HTTP 400 NoSegment', async () => {
  await assert.rejects(makeClient(async () => { throw new TypeError('offline'); }).route(origin, destination), error => error.code === 'network');
  await assert.rejects(makeClient(async () => new Response('', { status: 503 })).route(origin, destination), error => error.code === 'network');
  await assert.rejects(makeClient(async () => new Response('broken JSON')).route(origin, destination), error => error.code === 'response');
  await assert.rejects(makeClient(async () => new Response(JSON.stringify({ code: 'NoSegment' }), { status: 400 })).route(origin, destination), error => error.code === 'no-route');
});

test('honors busy-service cooldown before making another network request', async () => {
  let calls = 0;
  let clock = 1000;
  const client = makeClient(async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '120' } }); }, { now: () => clock });
  await assert.rejects(client.route(origin, destination), error => error.code === 'busy');
  clock += 60_000;
  await assert.rejects(client.route(origin, destination), error => error.code === 'busy');
  assert.equal(calls, 1);
  clock += 60_001;
  await assert.rejects(client.route(origin, destination), error => error.code === 'busy');
  assert.equal(calls, 2);
});

test('cancels in-flight routing, releases the queue, and rejects already cancelled requests', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const client = makeClient(async (_url, { signal }) => {
    calls++;
    if (calls > 1) return response(payload());
    return new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); started(); });
  });
  const controller = new AbortController();
  const pending = client.route(origin, destination, controller.signal);
  await ready;
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  await assert.rejects(client.route(origin, destination, controller.signal), error => error.name === 'AbortError');
  assert.equal((await client.route(origin, destination)).distance, 4100);
  assert.equal(calls, 2);
});

test('times out and serializes requests with minimum spacing', async () => {
  const slow = makeClient((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })), { timeoutMs: 15 });
  await assert.rejects(slow.route(origin, destination), error => error.code === 'timeout');
  const starts = [];
  const client = makeClient(async () => { starts.push(Date.now()); return response(payload()); }, { minimumIntervalMs: 30 });
  await Promise.all([client.route(origin, destination), client.route([72.834601, 18.922], destination)]);
  assert.equal(starts.length, 2);
  assert.ok(starts[1] - starts[0] >= 25);
});
