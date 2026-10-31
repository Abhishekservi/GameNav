import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RouteError, routingClient, type Coordinate, type DrivingRoute } from './routes';

export type RouteState = { status: 'idle' | 'loading' | 'ready' | 'error'; route: DrivingRoute | null; message?: string };
const idle: RouteState = { status: 'idle', route: null };

export function useDrivingRoute(destinationRevision: number) {
  const [result, setResult] = useState<{ revision: number; state: RouteState }>({ revision: destinationRevision, state: idle });
  const identity = useRef(destinationRevision);
  const pending = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const clear = useCallback(() => {
    requestId.current++;
    pending.current?.abort();
    pending.current = null;
    setResult({ revision: identity.current, state: idle });
  }, []);
  useLayoutEffect(() => { identity.current = destinationRevision; clear(); }, [destinationRevision, clear]);
  useEffect(() => () => { requestId.current++; pending.current?.abort(); }, []);

  const calculate = useCallback(async (origin: Coordinate, destination: Coordinate) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const revision = identity.current;
    const id = ++requestId.current;
    setResult({ revision, state: { status: 'loading', route: null } });
    try {
      const route = await routingClient.route(origin, destination, controller.signal);
      if (id === requestId.current && revision === identity.current && !controller.signal.aborted) setResult({ revision, state: { status: 'ready', route } });
    } catch (error) {
      if (id === requestId.current && revision === identity.current && !controller.signal.aborted) setResult({ revision, state: { status: 'error', route: null, message: error instanceof RouteError ? error.message : 'Route calculation failed. Please try again.' } });
    } finally { if (id === requestId.current) pending.current = null; }
  }, []);
  return { state: result.revision === destinationRevision ? result.state : idle, calculate, clear };
}
