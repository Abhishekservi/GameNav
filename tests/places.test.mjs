import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlaceSearchClient, createSuggestionScheduler, normalizeQuery, parsePlaces } from '../src/search/places.ts';

function feature(properties = {}, coordinates = [72.8345657, 18.9219661]) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { name: 'Gateway of India', street: 'Apollo Bandar', locality: 'Apollo Bandar', city: 'Mumbai', state: 'Maharashtra', country: 'India', osm_type: 'W', osm_id: 28845634, osm_value: 'monument', type: 'house', ...properties } };
}
const collection = (...features) => ({ type: 'FeatureCollection', features });
const response = payload => new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
const clientWith = (fetcher, extra = {}) => createPlaceSearchClient({ endpoint: 'https://search.example/api/?key=public-key', minimumIntervalMs: 0, fetcher, ...extra });

test('parses real Photon coordinates in longitude/latitude order and removes duplicate addresses', () => {
  const [place] = parsePlaces(collection(feature()));
  assert.deepEqual(place.coordinates, [72.8345657, 18.9219661]);
  assert.equal(place.name, 'Gateway of India');
  assert.equal(place.address, 'Apollo Bandar, Mumbai, Maharashtra, India');
  assert.equal(place.id, 'W28845634');
  assert.equal(place.zoom, 16.2);
});

test('rejects invalid coordinates and unnamed features without discarding valid results', () => {
  const emptyProperties = { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} };
  const places = parsePlaces(collection(feature({}, [NaN, 18]), feature({}, [72, 91]), feature({}, ['72', 18]), emptyProperties, feature({ name: 'Zero meridian', osm_id: 123 }, [0, 0])));
  assert.equal(places.length, 1);
  assert.deepEqual(places[0].coordinates, [0, 0]);
  assert.throws(() => parsePlaces({ error: 'bad upstream response' }), error => error.code === 'response');
  assert.throws(() => parsePlaces({ features: [] }), error => error.code === 'response');
});

test('deduplicates nearby objects for the same landmark and retains distinct places', () => {
  const places = parsePlaces(collection(feature(), feature({ osm_id: 434893333 }, [72.834564, 18.9219636]), feature({ name: 'Ferry terminal', osm_id: 870449150 }, [72.8345228, 18.9229191])));
  assert.equal(places.length, 2);
  assert.equal(places[1].name, 'Ferry terminal');
});

test('handles unnamed addresses and city results without inventing place names', () => {
  const [address] = parsePlaces(collection(feature({ name: '', housenumber: '12', street: 'Marine Drive', osm_id: 42 })));
  assert.equal(address.name, '12 Marine Drive');
  const [city] = parsePlaces(collection(feature({ name: 'Mumbai', type: 'city', osm_value: 'city' })));
  assert.equal(city.zoom, 11.7);
  const [building] = parsePlaces(collection(feature({ osm_value: 'yes', osm_key: 'building' })));
  assert.equal(building.category, 'building');
});

test('encodes user input as a query value, preserves configured parameters, and caches repeated searches', async () => {
  const requests = [];
  const client = clientWith(async (url, options) => { requests.push({ url: new URL(url), options }); return response(collection(feature())); });
  await client.search('  Gateway  of India & limit=999  ');
  await client.search('gateway of india & limit=999');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get('q'), 'Gateway of India & limit=999');
  assert.equal(requests[0].url.searchParams.get('limit'), '12');
  assert.equal(requests[0].url.searchParams.get('key'), 'public-key');
  assert.equal(requests[0].url.searchParams.get('lat'), '18.94');
  assert.equal(requests[0].url.searchParams.get('lon'), '72.83');
  assert.equal(requests[0].url.searchParams.get('zoom'), '10');
  assert.equal(requests[0].url.searchParams.get('location_bias_scale'), '0.2');
  assert.match(requests[0].options.headers['User-Agent'], /^GameNav\//);
});

test('expires cached results and caches empty results without fabricating suggestions', async () => {
  let clock = 1000;
  let calls = 0;
  const client = clientWith(async () => { calls++; return response(collection()); }, { cacheTtlMs: 100, now: () => clock });
  assert.deepEqual(await client.search('missing landmark'), []);
  assert.deepEqual(await client.search('missing landmark'), []);
  assert.equal(calls, 1);
  clock += 101;
  await client.search('missing landmark');
  assert.equal(calls, 2);
});

test('rejects invalid queries and insecure configuration before contacting a provider', async () => {
  let calls = 0;
  const client = clientWith(async () => { calls++; return response(collection()); });
  await assert.rejects(client.search(' a '), error => error.code === 'query');
  await assert.rejects(client.search('x'.repeat(121)), error => error.code === 'query');
  const insecure = clientWith(async () => { calls++; return response(collection()); }, { endpoint: 'http://search.example/api/' });
  await assert.rejects(insecure.search('Mumbai'), error => error.code === 'configuration');
  assert.equal(calls, 0);
  assert.equal(normalizeQuery('  मुंबई   Central  '), 'मुंबई Central');
});

test('reports provider failures and unreadable responses without fake fallback data', async () => {
  let calls = 0;
  let clock = 1000;
  const busy = clientWith(async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '30' } }); }, { now: () => clock });
  await assert.rejects(busy.search('Mumbai'), error => error.code === 'busy');
  await assert.rejects(busy.search('Delhi'), error => error.code === 'busy');
  assert.equal(calls, 1);
  clock += 30_001;
  await assert.rejects(busy.search('Delhi'), error => error.code === 'busy');
  assert.equal(calls, 2);
  await assert.rejects(clientWith(async () => new Response('', { status: 503 })).search('Mumbai'), error => error.code === 'network');
  await assert.rejects(clientWith(async () => new Response('not json')).search('Mumbai'), error => error.code === 'response');
  await assert.rejects(clientWith(async () => { throw new TypeError('offline'); }).search('Mumbai'), error => error.code === 'network');
});

test('cancels an in-flight request and permits the next search to complete', async () => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const client = clientWith(async (_url, { signal }) => {
    calls++;
    if (calls === 1) return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      started();
    });
    return response(collection(feature()));
  });
  const controller = new AbortController();
  const first = client.search('Mumbai airport', controller.signal);
  await ready;
  controller.abort();
  await assert.rejects(first, error => error.name === 'AbortError');
  assert.equal((await client.search('Gateway of India')).length, 1);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(client.search('Mumbai', cancelled.signal), error => error.name === 'AbortError');
  assert.equal(calls, 2);
});

test('times out an unresponsive provider', async () => {
  const client = clientWith(async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  }), { timeoutMs: 20 });
  await assert.rejects(client.search('Mumbai'), error => error.code === 'timeout');
});

test('serializes simultaneous requests and maintains the minimum spacing', async () => {
  let active = 0;
  let maximumActive = 0;
  const started = [];
  const client = clientWith(async () => {
    active++; maximumActive = Math.max(maximumActive, active); started.push(Date.now());
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return response(collection());
  }, { minimumIntervalMs: 30 });
  await Promise.all([client.search('Mumbai'), client.search('Delhi')]);
  assert.equal(maximumActive, 1);
  assert.ok(started[1] - started[0] >= 29);
});


test('typing a burst sends only the latest normalized suggestion query', async () => {
  const calls = [];
  const scheduler = createSuggestionScheduler(query => calls.push(query), 15);
  scheduler.schedule('gat');
  scheduler.schedule('gate');
  scheduler.schedule('  Gateway   of India  ');
  assert.deepEqual(calls, []);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(calls, ['Gateway of India']);
});

test('clearing, short input, excessive input, and closing cancel scheduled suggestions', async () => {
  const calls = [];
  const scheduler = createSuggestionScheduler(query => calls.push(query), 15);
  scheduler.schedule('Mumbai');
  scheduler.schedule('');
  scheduler.schedule('ab');
  scheduler.schedule('x'.repeat(121));
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(calls, []);
  scheduler.schedule('Bandra');
  scheduler.cancel();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(calls, []);
});

test('keyboard submit searches immediately without a second delayed request', async () => {
  const calls = [];
  const scheduler = createSuggestionScheduler(query => calls.push(query), 15);
  scheduler.schedule('Gateway');
  scheduler.submit('Gateway of India');
  assert.deepEqual(calls, ['Gateway of India']);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(calls, ['Gateway of India']);
  scheduler.submit('a');
  assert.equal(calls.length, 1);
});

test('groups nearby station platforms without hiding distant branches with the same address label', () => {
  const places = parsePlaces(collection(
    feature({ name: 'Bandra', osm_id: 10 }, [72.84, 19.05]),
    feature({ name: 'Bandra', osm_id: 11 }, [72.841, 19.05]),
    feature({ name: 'Bandra', osm_id: 12 }, [72.85, 19.05]),
    feature({ name: 'Bandra West', osm_id: 13 }, [72.84, 19.05]),
  ));
  assert.deepEqual(places.map(place => place.id), ['W10', 'W12', 'W13']);
});
