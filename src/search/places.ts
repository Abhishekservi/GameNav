export type Place = {
  id: string;
  name: string;
  address: string;
  coordinates: [number, number];
  category: string;
  zoom: number;
};

export const SEARCH_ENDPOINT = process.env.EXPO_PUBLIC_SEARCH_URL || 'https://photon.komoot.io/api/';
export const SEARCH_PROVIDER = 'Photon';
export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 120;
const RESULT_LIMIT = 8;

export class PlaceSearchError extends Error {
  readonly code: 'query' | 'configuration' | 'network' | 'timeout' | 'busy' | 'response';

  constructor(code: PlaceSearchError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'PlaceSearchError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 280) : '';
}

export function normalizeQuery(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function parsePlaces(payload: unknown): Place[] {
  const collection = record(payload);
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new PlaceSearchError('response', 'Search returned an unreadable response. Please try again.');
  }
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const raw of collection.features.slice(0, 64)) {
    const feature = record(raw);
    const geometry = record(feature?.geometry);
    const properties = record(feature?.properties);
    const coordinates = geometry?.coordinates;
    if (feature?.type !== 'Feature' || geometry?.type !== 'Point' || !properties || !Array.isArray(coordinates)) continue;
    const [longitude, latitude] = coordinates;
    if (typeof longitude !== 'number' || typeof latitude !== 'number' || !Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) continue;
    const street = [text(properties.housenumber), text(properties.street)].filter(Boolean).join(' ');
    const name = text(properties.name) || street || text(properties.city) || text(properties.district) || text(properties.country);
    if (!name) continue;
    const parts = [street, text(properties.locality), text(properties.district), text(properties.city), text(properties.state), text(properties.postcode), text(properties.country)];
    const uniqueParts = parts.filter((part, index) => part && part.toLowerCase() !== name.toLowerCase() && parts.findIndex(other => other.toLowerCase() === part.toLowerCase()) === index);
    const address = uniqueParts.join(', ').slice(0, 280);
    const osmType = text(properties.osm_type);
    const osmId = String(properties.osm_id ?? '');
    const id = /^[NWR]$/.test(osmType) && /^\d{1,20}$/.test(osmId)
      ? `${osmType}${osmId}` : `${name}:${longitude}:${latitude}`;
    // Some landmarks have multiple OSM objects within a few meters of each other.
    const nearbyKey = `${name.toLowerCase()}:${address.toLowerCase()}:${longitude.toFixed(4)}:${latitude.toFixed(4)}`;
    if (seen.has(id) || seen.has(nearbyKey)) continue;
    seen.add(id); seen.add(nearbyKey);
    const zoomByType: Record<string, number> = { country: 4.8, state: 7, county: 10, city: 11.7, district: 13, locality: 14, street: 16 };
    const rawCategory = text(properties.osm_value);
    const category = (rawCategory && !['yes', 'no', 'unknown', 'other'].includes(rawCategory) ? rawCategory : text(properties.osm_key) || 'place').replace(/_/g, ' ');
    places.push({ id, name, address, coordinates: [longitude, latitude], category, zoom: zoomByType[text(properties.type)] ?? 16.2 });
    if (places.length === RESULT_LIMIT) break;
  }
  return places;
}

function aborted(): Error {
  const error = new Error('Search cancelled');
  error.name = 'AbortError';
  return error;
}

function waitFor(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(aborted());
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(aborted()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

type ClientOptions = {
  endpoint?: string;
  fetcher?: typeof fetch;
  minimumIntervalMs?: number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  now?: () => number;
};

export function createPlaceSearchClient({ endpoint = SEARCH_ENDPOINT, fetcher = fetch, minimumIntervalMs = 1500, timeoutMs = 10_000, cacheTtlMs = 10 * 60_000, now = Date.now }: ClientOptions = {}) {
  const cache = new Map<string, { expires: number; places: Place[] }>();
  let nextRequestAt = 0;
  let blockedUntil = 0;
  let queue = Promise.resolve();

  const cached = (key: string) => {
    const entry = cache.get(key);
    if (entry && entry.expires > now()) return entry.places;
    cache.delete(key);
    return undefined;
  };

  async function request(query: string, signal?: AbortSignal): Promise<Place[]> {
    if (signal?.aborted) throw aborted();
    const key = query.toLowerCase();
    const hit = cached(key);
    if (hit !== undefined) return hit;
    if (blockedUntil > now()) throw new PlaceSearchError('busy', `Search is busy. Try again in ${Math.ceil((blockedUntil - now()) / 1000)} seconds.`);
    let url: URL;
    try {
      url = new URL(endpoint);
      if (url.protocol !== 'https:') throw new Error('HTTPS required');
    } catch { throw new PlaceSearchError('configuration', 'Place search is not configured correctly.'); }
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(RESULT_LIMIT));
    url.searchParams.set('lang', 'en');
    // Public city-center bias only. Never transmit the phone's GPS position.
    url.searchParams.set('lat', '18.94');
    url.searchParams.set('lon', '72.83');
    await waitFor(Math.max(0, nextRequestAt - now()), signal);
    if (signal?.aborted) throw aborted();
    nextRequestAt = now() + minimumIntervalMs;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetcher(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'GameNav/1.0 (https://github.com/Abhishekservi/GameNav)' },
      });
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        blockedUntil = now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) * 1000 : 3000);
        throw new PlaceSearchError('busy', 'Search is busy. Wait a moment, then try again.');
      }
      if (!response.ok) throw new PlaceSearchError('network', 'The search service is unavailable. Please try again.');
      let payload: unknown;
      try { payload = await response.json(); }
      catch { throw new PlaceSearchError('response', 'Search returned an unreadable response. Please try again.'); }
      if (signal?.aborted) throw aborted();
      const places = parsePlaces(payload);
      if (cache.size >= 40) cache.delete(cache.keys().next().value!);
      cache.set(key, { places, expires: now() + cacheTtlMs });
      return places;
    } catch (error) {
      if (signal?.aborted) throw aborted();
      if (timedOut) throw new PlaceSearchError('timeout', 'Search took too long. Check your connection and try again.');
      if (error instanceof PlaceSearchError) throw error;
      throw new PlaceSearchError('network', 'Couldn’t connect to place search. Check your connection and try again.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }

  return {
    search(value: string, signal?: AbortSignal): Promise<Place[]> {
      const query = normalizeQuery(value);
      if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) return Promise.reject(new PlaceSearchError('query', `Enter between ${MIN_QUERY_LENGTH} and ${MAX_QUERY_LENGTH} characters.`));
      const result = queue.then(() => request(query, signal));
      queue = result.then(() => {}, () => {});
      return result;
    },
  };
}

export const placeSearchClient = createPlaceSearchClient();
