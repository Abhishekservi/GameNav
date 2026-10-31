export type Coordinate = [number, number];
export type DrivingRoute = {
  geometry: { type: 'LineString'; coordinates: Coordinate[] };
  distance: number;
  duration: number;
  origin: Coordinate;
  destination: Coordinate;
  start: Coordinate;
  end: Coordinate;
  startOffset: number;
  endOffset: number;
  calculatedAt: number;
  bounds: [number, number, number, number];
};

export const ROUTING_URL = process.env.EXPO_PUBLIC_ROUTING_URL || 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
export const ROUTING_CREDIT = process.env.EXPO_PUBLIC_ROUTING_CREDIT || 'OSRM / FOSSGIS';
export const ROUTING_CREDIT_URL = process.env.EXPO_PUBLIC_ROUTING_CREDIT_URL || 'https://routing.openstreetmap.de/about.html';

export class RouteError extends Error {
  readonly code: 'configuration' | 'coordinates' | 'no-route' | 'response' | 'network' | 'timeout' | 'busy';
  constructor(code: RouteError['code'], message: string) { super(message); this.name = 'RouteError'; this.code = code; }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number' && Number.isFinite(value[0]) && Number.isFinite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}
function nonnegative(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }

export function distanceBetween(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function formatDistance(meters: number): string { return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.ceil(meters / 10) * 10} m`; }
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

export function parseRoute(payload: unknown, origin: Coordinate, destination: Coordinate, calculatedAt = Date.now()): DrivingRoute {
  const body = object(payload);
  if (body?.code === 'NoRoute' || body?.code === 'NoSegment') throw new RouteError('no-route', 'No driving route found near these places. Try a nearby road or a more specific destination.');
  if (body?.code !== 'Ok' || !Array.isArray(body.routes) || !Array.isArray(body.waypoints) || body.waypoints.length !== 2) throw new RouteError('response', 'The route service returned an unreadable route. Please try again.');
  const route = object(body.routes[0]);
  const geometry = object(route?.geometry);
  const coordinates = geometry?.coordinates;
  const start = object(body.waypoints[0]);
  const end = object(body.waypoints[1]);
  if (!route || !nonnegative(route.distance) || !nonnegative(route.duration) || geometry?.type !== 'LineString' || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 100_000 || !coordinates.every(isCoordinate) || !isCoordinate(start?.location) || !isCoordinate(end?.location) || !nonnegative(start.distance) || !nonnegative(end.distance)) throw new RouteError('response', 'The route service returned an unreadable route. Please try again.');
  const startOffset = distanceBetween(origin, start.location);
  const endOffset = distanceBetween(destination, end.location);
  // Avoid silently routing to a distant road or accepting unrelated geometry.
  if (Math.max(startOffset, endOffset, start.distance, end.distance) > 510) throw new RouteError('no-route', 'A drivable road is too far from one of these places. Choose a nearby road entrance.');
  if (distanceBetween(coordinates[0], start.location) > 30 || distanceBetween(coordinates[coordinates.length - 1], end.location) > 30) throw new RouteError('response', 'The returned route does not match its road endpoints. Please try again.');
  const points = coordinates.map(([lng, lat]) => [lng, lat] as Coordinate);
  const bounds: DrivingRoute['bounds'] = [180, 90, -180, -90];
  for (const [lng, lat] of points) { bounds[0] = Math.min(bounds[0], lng); bounds[1] = Math.min(bounds[1], lat); bounds[2] = Math.max(bounds[2], lng); bounds[3] = Math.max(bounds[3], lat); }
  return { geometry: { type: 'LineString', coordinates: points }, distance: route.distance, duration: route.duration, origin: [...origin], destination: [...destination], start: [...start.location], end: [...end.location], startOffset, endOffset, calculatedAt, bounds };
}

function abortError() { const error = new Error('Route cancelled'); error.name = 'AbortError'; return error; }
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

type Options = { endpoint?: string; fetcher?: typeof fetch; minimumIntervalMs?: number; timeoutMs?: number; now?: () => number };
export function createRoutingClient({ endpoint = ROUTING_URL, fetcher = fetch, minimumIntervalMs = 1500, timeoutMs = 15_000, now = Date.now }: Options = {}) {
  let queue = Promise.resolve();
  let nextRequestAt = 0;
  let blockedUntil = 0;
  const cache = new Map<string, DrivingRoute>();
  async function request(origin: Coordinate, destination: Coordinate, signal?: AbortSignal): Promise<DrivingRoute> {
    if (signal?.aborted) throw abortError();
    if (!isCoordinate(origin) || !isCoordinate(destination)) throw new RouteError('coordinates', 'A valid GPS position and destination are needed.');
    const pair = [origin, destination].map(point => point.map(value => value.toFixed(6)).join(',')).join(';');
    const cached = cache.get(pair);
    if (cached && now() - cached.calculatedAt < 5 * 60_000) return cached;
    if (blockedUntil > now()) throw new RouteError('busy', `Routing is busy. Try again in ${Math.ceil((blockedUntil - now()) / 1000)} seconds.`);
    let url: URL;
    try { url = new URL(endpoint); if (url.protocol !== 'https:') throw new Error(); }
    catch { throw new RouteError('configuration', 'Driving routes are not configured correctly.'); }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${pair}`;
    for (const [key, value] of Object.entries({ overview: 'full', geometries: 'geojson', steps: 'false', alternatives: 'false', radiuses: '500;500', generate_hints: 'false' })) url.searchParams.set(key, value);
    await wait(Math.max(0, nextRequestAt - now()), signal);
    if (signal?.aborted) throw abortError();
    nextRequestAt = now() + minimumIntervalMs;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetcher(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'GameNav/1.0 (https://github.com/Abhishekservi/GameNav)' } });
      if (response.status === 429) {
        const retry = response.headers.get('Retry-After');
        const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : 0;
        blockedUntil = Math.max(now() + 3000, seconds ? now() + seconds * 1000 : Date.parse(retry || '') || 0);
        throw new RouteError('busy', 'Routing is busy. Wait a moment before trying again.');
      }
      if (!response.ok && response.status !== 400) throw new RouteError('network', 'The route service is unavailable. Please try again.');
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new RouteError('response', 'The route service returned an unreadable route. Please try again.'); }
      if (signal?.aborted) throw abortError();
      const route = parseRoute(payload, origin, destination, now());
      if (cache.size >= 8) cache.delete(cache.keys().next().value!);
      cache.set(pair, route);
      return route;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (timedOut) throw new RouteError('timeout', 'Routing took too long. Check your connection and try again.');
      if (error instanceof RouteError) throw error;
      throw new RouteError('network', 'Couldn’t connect to routing. Check your connection and try again.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  return { route(origin: Coordinate, destination: Coordinate, signal?: AbortSignal) {
    const result = queue.then(() => request(origin, destination, signal));
    queue = result.then(() => {}, () => {});
    return result;
  } };
}
export const routingClient = createRoutingClient();
