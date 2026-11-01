import type { Coordinate, DrivingRoute, RouteStep } from './routes';

export type JourneyFix = { timestamp: number; coords: { longitude: number; latitude: number; accuracy: number | null; speed?: number | null; heading?: number | null } };
export type JourneyProgress = { along: number; stepIndex: number; timestamp: number; arrivalCount: number };
export type JourneyReading = {
  status: 'waiting' | 'tracking' | 'off-route' | 'uncertain' | 'complete';
  progress: JourneyProgress | null;
  remaining: number | null;
  instruction: { text: string; road: string; glyph: string; distance: number } | null;
  distanceToPin: number | null;
};
type Segment = { a: Coordinate; b: Coordinate; start: number; distance: number; stepIndex: number };
export type JourneyTrack = { route: DrivingRoute; segments: Segment[]; stepStarts: number[]; total: number };
const R = 6371000;
const RAD = Math.PI / 180;
const longitudeDelta = (value: number) => ((value + 540) % 360) - 180;

function meters(a: Coordinate, b: Coordinate): number {
  const h = Math.sin((b[1] - a[1]) * RAD / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(longitudeDelta(b[0] - a[0]) * RAD / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function usableJourneyFix(fix: JourneyFix | null, fresh: boolean, now = Date.now()): fix is JourneyFix {
  if (!fix || !fresh) return false;
  const { longitude, latitude, accuracy } = fix.coords;
  return Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90 && accuracy !== null && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 35 && Number.isFinite(fix.timestamp) && now - fix.timestamp <= 12_000 && fix.timestamp <= now + 2000;
}

export function journeyStartError(route: DrivingRoute | null, fix: JourneyFix | null, fresh: boolean, now = Date.now()): string | null {
  if (!route || route.steps.length < 2 || route.distance < 5) return 'Calculate a driving route first.';
  if (!usableJourneyFix(fix, fresh, now)) return 'Wait for a fresh GPS position accurate to 35 meters or better.';
  if ((fix.coords.speed ?? 0) > 2.2) return 'Stop safely before starting the journey.';
  if (now - route.calculatedAt > 5 * 60_000 || route.calculatedAt > now + 2000 || meters(route.origin, [fix.coords.longitude, fix.coords.latitude]) > 150) return 'Your route start has changed or expired. Recalculate from your location first.';
  return null;
}

export function buildJourneyTrack(route: DrivingRoute): JourneyTrack {
  const segments: Segment[] = [];
  const stepStarts: number[] = [];
  let total = 0;
  route.steps.forEach((step, stepIndex) => {
    stepStarts.push(total);
    const lengths = step.geometry.slice(1).map((point, index) => meters(step.geometry[index], point));
    const length = lengths.reduce((sum, value) => sum + value, 0);
    let offset = 0;
    lengths.forEach((value, index) => {
      const distance = length > 0 ? step.distance * value / length : 0;
      if (value > 0.01) segments.push({ a: step.geometry[index], b: step.geometry[index + 1], start: total + offset, distance, stepIndex });
      offset += distance;
    });
    total += step.distance;
  });
  return { route, segments, stepStarts, total };
}

export function maneuverInstruction(step: RouteStep, endOffset = 0): { text: string; road: string; glyph: string } {
  const modifier = step.modifier;
  const glyph = modifier === 'uturn' ? '↶' : modifier?.includes('left') ? '↰' : modifier?.includes('right') ? '↱' : '↑';
  if (step.type === 'arrive') return { text: endOffset > 30 ? 'Reach the end of the driving route' : 'Arrive near your destination', road: '', glyph: '⚑' };
  if (step.type === 'roundabout' || step.type === 'rotary') return { text: step.exit ? `At the roundabout, take exit ${step.exit}` : 'Continue around the roundabout', road: step.name, glyph: '⟳' };
  if (step.type === 'exit roundabout' || step.type === 'exit rotary') return { text: 'Exit the roundabout', road: step.name, glyph };
  if (step.type === 'depart') return { text: 'Head along', road: step.name || 'the route', glyph: '↑' };
  if (step.type === 'notification') return { text: 'Continue on the route', road: step.name, glyph: '↑' };
  if (step.type === 'new name') return { text: 'Continue onto', road: step.name || 'the next road', glyph: '↑' };
  const direction = modifier === 'uturn' ? 'Make a U-turn' : modifier === 'straight' || !modifier ? 'Continue straight' : modifier.startsWith('slight') ? `Bear ${modifier.split(' ')[1]}` : modifier.startsWith('sharp') ? `Turn sharply ${modifier.split(' ')[1]}` : `Turn ${modifier}`;
  const text = step.type === 'merge' ? `Merge${modifier && modifier !== 'straight' ? ` ${modifier}` : ''}`
    : step.type === 'on ramp' ? `Take the ramp${modifier && modifier !== 'straight' ? ` ${modifier}` : ''}`
      : step.type === 'off ramp' ? `Take the exit${modifier && modifier !== 'straight' ? ` ${modifier}` : ''}`
        : step.type === 'fork' ? `Keep ${modifier?.includes('left') ? 'left' : modifier?.includes('right') ? 'right' : 'straight'} at the fork`
          : step.type === 'roundabout turn' ? `At the roundabout, ${direction.toLowerCase()}` : direction;
  return { text, road: step.name, glyph };
}

export function evaluateJourney(track: JourneyTrack, fix: JourneyFix | null, fresh: boolean, previous: JourneyProgress | null = null, now = Date.now()): JourneyReading {
  const paused = (status: JourneyReading['status']): JourneyReading => ({ status, progress: previous, remaining: null, instruction: null, distanceToPin: null });
  if (!usableJourneyFix(fix, fresh, now)) return paused('waiting');
  if (previous && fix.timestamp <= previous.timestamp) return paused('waiting');
  const point: Coordinate = [fix.coords.longitude, fix.coords.latitude];
  const scale = Math.cos(point[1] * RAD) * R * RAD;
  const accuracy = fix.coords.accuracy!;
  const corridor = Math.max(35, accuracy * 2);
  const candidates = track.segments.map(segment => {
    const ax = longitudeDelta(segment.a[0] - point[0]) * scale;
    const ay = (segment.a[1] - point[1]) * R * RAD;
    const bx = longitudeDelta(segment.b[0] - point[0]) * scale;
    const by = (segment.b[1] - point[1]) * R * RAD;
    const dx = bx - ax; const dy = by - ay;
    const fraction = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    const bearing = (Math.atan2(dx, dy) / RAD + 360) % 360;
    const course = fix.coords.heading;
    const wrongDirection = (fix.coords.speed ?? -1) >= 3 && course !== null && course !== undefined && Number.isFinite(course) && course >= 0 && course <= 360 && Math.abs(longitudeDelta(bearing - course)) > 110;
    return { along: segment.start + fraction * segment.distance, offset: Math.hypot(ax + dx * fraction, ay + dy * fraction), stepIndex: segment.stepIndex, wrongDirection };
  });
  const nearest = candidates.reduce((distance, candidate) => Math.min(distance, candidate.offset), Infinity);
  if (nearest > corridor) return paused('off-route');
  const elapsed = previous ? Math.max(0, Math.min(30, (fix.timestamp - previous.timestamp) / 1000)) : 0;
  const maxAdvance = previous ? Math.max(100, elapsed * 55 + accuracy * 2) : 200;
  const viable = candidates.filter(candidate => candidate.offset <= Math.min(corridor, nearest + 8) && !candidate.wrongDirection && candidate.along >= (previous?.along ?? 0) - 40 && candidate.along <= (previous?.along ?? 0) + maxAdvance);
  viable.sort((a, b) => a.offset - b.offset || Math.abs(a.along - (previous?.along ?? 0)) - Math.abs(b.along - (previous?.along ?? 0)));
  const best = viable[0];
  if (!best || viable.some(candidate => Math.abs(candidate.along - best.along) > 80 && candidate.offset <= best.offset + 5)) return paused('uncertain');
  const stepIndex = Math.max(previous?.stepIndex ?? 0, best.stepIndex);
  const remaining = Math.max(0, track.total - best.along);
  const speed = fix.coords.speed;
  const nearEnd = remaining <= 25 && meters(point, track.route.end) <= 30 && speed !== undefined && speed !== null && speed >= 0 && speed <= 2.2 && accuracy <= 25;
  const arrivalCount = nearEnd ? (previous?.arrivalCount ?? 0) + 1 : 0;
  const progress = { along: best.along, stepIndex, timestamp: fix.timestamp, arrivalCount };
  const next = Math.min(stepIndex + 1, track.route.steps.length - 1);
  const instruction = { ...maneuverInstruction(track.route.steps[next], track.route.endOffset), distance: Math.max(0, track.stepStarts[next] - best.along) };
  return { status: arrivalCount >= 3 ? 'complete' : 'tracking', progress, remaining, instruction, distanceToPin: meters(point, track.route.destination) };
}
