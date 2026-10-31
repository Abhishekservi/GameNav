import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Place } from './places';

type DestinationState = { destination: Place | null; revision: number; select: (place: Place) => void; clear: () => void };
const DestinationContext = createContext<DestinationState | null>(null);

export function DestinationProvider({ children }: { children: ReactNode }) {
  const [destination, setDestination] = useState<Place | null>(null);
  const [revision, setRevision] = useState(0);
  const select = useCallback((place: Place) => { setDestination(place); setRevision(value => value + 1); }, []);
  const clear = useCallback(() => { setDestination(null); setRevision(value => value + 1); }, []);
  const value = useMemo(() => ({ destination, revision, select, clear }), [destination, revision, select, clear]);
  return <DestinationContext.Provider value={value}>{children}</DestinationContext.Provider>;
}

export function useDestination() {
  const value = useContext(DestinationContext);
  if (!value) throw new Error('DestinationProvider is required');
  return value;
}
