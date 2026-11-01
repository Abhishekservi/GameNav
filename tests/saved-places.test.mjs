import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSavedPlacesStore, parseSavedPlaces, slotForPlace } from '../src/saved/places.ts';

const place = (name = 'Public landmark', coordinates = [72.8346, 18.922]) => ({ id: name, name, address: 'Mumbai', category: 'landmark', zoom: 17, coordinates });
const storage = () => {
  let text = null;
  return { read: async () => text, write: async next => { text = next; } };
};

test('saved places survive a fresh store and removing one keeps the others', async () => {
  const disk = storage();
  const first = createSavedPlacesStore(disk);
  await first.save('home', place('Home landmark'));
  await first.save('work', place('Work landmark'));
  const reopened = createSavedPlacesStore(disk);
  assert.equal((await reopened.load()).home.name, 'Home landmark');
  await reopened.remove('home');
  const result = await createSavedPlacesStore(disk).load();
  assert.equal(result.home, undefined);
  assert.equal(result.work.name, 'Work landmark');
});

test('concurrent hydration and saves preserve every slot and latest replacement', async () => {
  const disk = storage();
  let reads = 0;
  let inFlight = 0;
  const writes = [];
  const store = createSavedPlacesStore({ read: async () => { reads++; return disk.read(); }, write: async text => {
    assert.equal(inFlight++, 0);
    await new Promise(resolve => setTimeout(resolve, 5));
    writes.push(JSON.parse(text).places);
    await disk.write(text); inFlight--;
  } });
  await Promise.all([store.load(), store.save('home', place('First')), store.save('work', place('Work')), store.save('home', place('Replacement')), store.save('shop', place('Shop'))]);
  assert.equal(reads, 1);
  assert.equal(writes.length, 4);
  const result = await createSavedPlacesStore(disk).load();
  assert.equal(result.home.name, 'Replacement');
  assert.equal(result.work.name, 'Work');
  assert.equal(result.shop.name, 'Shop');
});

test('failed writes do not report a save or poison subsequent edits', async () => {
  const disk = storage();
  let fail = false;
  const store = createSavedPlacesStore({ read: disk.read, write: async text => { if (fail) throw new Error('Disk full'); await disk.write(text); } });
  await store.save('home', place('Original'));
  fail = true;
  await assert.rejects(store.save('home', place('Not saved')), /Disk full/);
  assert.equal((await store.load()).home.name, 'Original');
  assert.equal((await createSavedPlacesStore(disk).load()).home.name, 'Original');
  fail = false;
  await store.save('shop', place('Shop'));
  assert.equal((await store.load()).shop.name, 'Shop');
});

test('invalid or unsupported persisted data is rejected before an overwrite', async () => {
  const invalid = ['{', JSON.stringify({ version: 2, places: {} }), JSON.stringify({ version: 1, places: { home: place('Bad', [181, 19]) } }), JSON.stringify({ version: 1, places: { work: { ...place(), zoom: null } } }), 'x'.repeat(30001)];
  for (const text of invalid) {
    assert.throws(() => parseSavedPlaces(text));
    let writes = 0;
    const store = createSavedPlacesStore({ read: async () => text, write: async () => { writes++; } });
    await assert.rejects(store.save('shop', place()));
    assert.equal(writes, 0);
  }
  assert.deepEqual(parseSavedPlaces(null), {});
});

test('invalid saves make no storage changes, and snapshots cannot mutate saved coordinates', async () => {
  const disk = storage();
  const store = createSavedPlacesStore(disk);
  await assert.rejects(store.save('home', place('Bad', [NaN, 19])));
  assert.equal(await disk.read(), null);
  const input = place();
  const snapshot = await store.save('home', input);
  input.coordinates[0] = 0;
  snapshot.home.coordinates[0] = 10;
  assert.equal((await store.load()).home.coordinates[0], 72.8346);
});

test('mission identity follows coordinates and name, without aliasing different places', () => {
  const saved = { home: place() };
  assert.equal(slotForPlace(saved, { ...place(), id: 'new-search-id' }), 'home');
  assert.equal(slotForPlace(saved, place('Public landmark', [72.84, 18.93])), null);
  assert.equal(slotForPlace(saved, place('Other landmark')), null);
});
