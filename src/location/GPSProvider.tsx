import { createContext, useContext, type ReactNode } from 'react';
import { useGPS } from '../hooks/useGPS';

const GPSContext = createContext<ReturnType<typeof useGPS> | null>(null);

export function GPSProvider({ children }: { children: ReactNode }) {
  const gps = useGPS();
  return <GPSContext.Provider value={gps}>{children}</GPSContext.Provider>;
}

export function useGPSState() {
  const value = useContext(GPSContext);
  if (!value) throw new Error('GPSProvider is required');
  return value;
}
