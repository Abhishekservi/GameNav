import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { FIX_MAX_AGE_MS, isUsableFix, shortestAngle } from '../location/position';

type GPSState = 'requesting' | 'acquiring' | 'live' | 'denied' | 'disabled' | 'error' | 'weak' | 'paused';
export function useGPS() {
  const [fix, setFix] = useState<Location.LocationObject | null>(null);
  const [heading, setHeading] = useState(0);
  const [state, setState] = useState<GPSState>('requesting');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [attempt, setAttempt] = useState(0);
  const latest = useRef<Location.LocationObject | null>(null);
  const lastHeading = useRef({ angle: 0, time: 0 });
  const [active, setActive] = useState(AppState.currentState === 'active');
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const subscriptions: Location.LocationSubscription[] = [];
    const keep = (sub: Location.LocationSubscription) => cancelled ? sub.remove() : subscriptions.push(sub);
    const updateHeading = (angle: number) => {
      if (cancelled || !Number.isFinite(angle) || angle < 0) return;
      const next = shortestAngle(lastHeading.current.angle, angle);
      if (Date.now() - lastHeading.current.time < 400 || Math.abs(next - lastHeading.current.angle) < 3) return;
      lastHeading.current = { angle: next, time: Date.now() };
      setHeading(next);
    };
    const start = async () => {
      setState('requesting');
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setCanAskAgain(permission.canAskAgain);
        if (!permission.granted) { setState('denied'); return; }
        const enabled = await Location.hasServicesEnabledAsync();
        if (cancelled) return;
        if (!enabled) { setState('disabled'); return; }
        setState('acquiring');
        keep(await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0, timeInterval: 1000 }, value => {
          if (cancelled) return;
          if (!isUsableFix(value)) { setState('weak'); return; }
          if (latest.current && value.timestamp <= latest.current.timestamp) return;
          latest.current = value;
          setFix(value);
          setNow(Date.now());
          setState('live');
          if ((value.coords.speed ?? -1) >= 2 && value.coords.heading !== null) updateHeading(value.coords.heading);
        }, () => { if (!cancelled) setState('error'); }));
        if (cancelled) return;
        // Course is more reliable when driving. Compass supplies heading at rest.
        try {
          keep(await Location.watchHeadingAsync(value => {
            if ((latest.current?.coords.speed ?? 0) < 2 && value.accuracy >= 1) updateHeading(value.trueHeading >= 0 ? value.trueHeading : value.magHeading);
          }));
        } catch { /* Position remains usable on devices without a compass. */ }
      } catch { if (!cancelled) setState('error'); }
    };
    void start();
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => { cancelled = true; clearInterval(timer); subscriptions.forEach(sub => sub.remove()); };
  }, [active, attempt]);

  const fresh = active && state === 'live' && !!fix && now - fix.timestamp <= FIX_MAX_AGE_MS;
  return { fix, heading, fresh, state: active ? state : 'paused' as GPSState, canAskAgain, retry };
}
