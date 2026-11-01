import { useCallback, useMemo, useState } from 'react';
import type { DrivingRoute } from './routes';
import { buildJourneyTrack, evaluateJourney, journeyStartError, usableJourneyFix, type JourneyFix, type JourneyReading } from './journey';

export function useJourney(route: DrivingRoute | null, fix: JourneyFix | null, fresh: boolean, now: number) {
  const track = useMemo(() => route ? buildJourneyTrack(route) : null, [route]);
  const [session, setSession] = useState<{ route: DrivingRoute; reading: JourneyReading; fix: JourneyFix | null; fresh: boolean } | null>(null);
  const active = !!route && session?.route === route;
  const startError = journeyStartError(route, fix, fresh, now);
  const needsRecalculation = !!route && (now - route.calculatedAt > 5 * 60_000 || route.calculatedAt > now + 2000);
  const start = useCallback(() => {
    const error = journeyStartError(route, fix, fresh);
    if (error || !route || !track) return error || 'Calculate a route first.';
    setSession({ route, reading: evaluateJourney(track, fix, fresh), fix, fresh });
    return null;
  }, [route, track, fix, fresh]);
  const end = useCallback(() => setSession(null), []);
  // Adjust history only for a new external GPS input. React retries this render
  // before committing, so a previous maneuver cannot flash after a GPS failure.
  if (active && track && session && (fix !== session.fix || fresh !== session.fresh)) {
    const unchanged = session.reading.status === 'complete' || (usableJourneyFix(fix, fresh, now) && fix.timestamp === session.reading.progress?.timestamp && session.reading.status === 'tracking');
    setSession({ ...session, fix, fresh, reading: unchanged ? session.reading : evaluateJourney(track, fix, fresh, session.reading.progress, now) });
  }
  return { active, reading: active ? session.reading : null, startError, needsRecalculation, start, end };
}
