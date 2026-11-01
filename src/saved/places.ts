import type { Place } from '../search/places';

export const SAVED_SLOTS = [
  { key: 'home', label: 'Home', letter: 'H', color: '#ffd66b' },
  { key: 'work', label: 'Work', letter: 'W', color: '#86d9ff' },
  { key: 'shop', label: 'Shop', letter: 'S', color: '#b2e49b' },
] as const;
export type SavedSlot = typeof SAVED_SLOTS[number]['key'];
export type SavedPlaces = Partial<Record<SavedSlot, Place>>;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function validPlace(value: unknown): value is Place {
  if (!isObject(value)) return false;
  const point = value.coordinates;
  return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 300 && typeof value.name === 'string' && !!value.name.trim() && value.name.length <= 200 && typeof value.address === 'string' && value.address.length <= 1000 && typeof value.category === 'string' && value.category.length <= 200 && typeof value.zoom === 'number' && Number.isFinite(value.zoom) && value.zoom >= 0 && value.zoom <= 20 && Array.isArray(point) && point.length === 2 && point.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
}

function copyPlace(place: Place): Place {
  return { id: place.id, name: place.name, address: place.address, category: place.category, zoom: place.zoom, coordinates: [...place.coordinates] };
}
function copyPlaces(places: SavedPlaces): SavedPlaces {
  return Object.fromEntries(SAVED_SLOTS.flatMap(slot => places[slot.key] ? [[slot.key, copyPlace(places[slot.key]!)]] : []));
}

export function parseSavedPlaces(text: string | null): SavedPlaces {
  if (text === null) return {};
  if (text.length > 30000) throw new Error('Saved places are unreadable.');
  const body: unknown = JSON.parse(text);
  if (!isObject(body) || body.version !== 1 || !isObject(body.places)) throw new Error('Saved places are unreadable.');
  const places: SavedPlaces = {};
  for (const { key } of SAVED_SLOTS) {
    const place = body.places[key];
    if (place !== undefined) {
      if (!validPlace(place)) throw new Error('A saved place is unreadable.');
      places[key] = copyPlace(place);
    }
  }
  return places;
}

export function slotForPlace(places: SavedPlaces, place: Place): SavedSlot | null {
  return SAVED_SLOTS.find(({ key }) => {
    const saved = places[key];
    return saved && saved.name === place.name && Math.abs(saved.coordinates[0] - place.coordinates[0]) < 0.000001 && Math.abs(saved.coordinates[1] - place.coordinates[1]) < 0.000001;
  })?.key ?? null;
}

// Serialize hydration and writes so fast edits cannot overwrite a newer save.
// The in-memory result changes only after the durable write succeeds.
export function createSavedPlacesStore(storage: { read: () => Promise<string | null>; write: (text: string) => Promise<void> }) {
  let current: SavedPlaces | null = null;
  let queue = Promise.resolve();
  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = queue.then(action);
    queue = result.then(() => {}, () => {});
    return result;
  }
  async function hydrate() {
    if (!current) current = parseSavedPlaces(await storage.read());
    return current;
  }
  return {
    load: () => enqueue(async () => copyPlaces(await hydrate())),
    save: (slot: SavedSlot, place: Place) => enqueue(async () => {
      if (!SAVED_SLOTS.some(item => item.key === slot) || !validPlace(place)) throw new Error('Choose a valid place.');
      const next = { ...await hydrate(), [slot]: copyPlace(place) };
      await storage.write(JSON.stringify({ version: 1, places: next }));
      current = next;
      return copyPlaces(next);
    }),
    remove: (slot: SavedSlot) => enqueue(async () => {
      const next = { ...await hydrate() };
      delete next[slot];
      await storage.write(JSON.stringify({ version: 1, places: next }));
      current = next;
      return copyPlaces(next);
    }),
  };
}
