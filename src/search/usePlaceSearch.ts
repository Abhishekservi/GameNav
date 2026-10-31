import { useCallback, useEffect, useRef, useState } from 'react';
import { PlaceSearchError, placeSearchClient, type Place } from './places';

export type SearchState =
  | { status: 'idle' | 'loading'; places: Place[]; query: string }
  | { status: 'success'; places: Place[]; query: string }
  | { status: 'error'; places: Place[]; query: string; message: string };

export function usePlaceSearch() {
  const [state, setState] = useState<SearchState>({ status: 'idle', places: [], query: '' });
  const pending = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const cancel = useCallback(() => {
    revision.current += 1;
    pending.current?.abort();
    pending.current = null;
    setState({ status: 'idle', places: [], query: '' });
  }, []);
  useEffect(() => () => { revision.current += 1; pending.current?.abort(); }, []);

  const search = useCallback(async (query: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const current = ++revision.current;
    setState({ status: 'loading', places: [], query });
    try {
      const places = await placeSearchClient.search(query, controller.signal);
      if (revision.current === current && !controller.signal.aborted) setState({ status: 'success', places, query });
    } catch (error) {
      if (revision.current === current && !controller.signal.aborted) setState({ status: 'error', places: [], query, message: error instanceof PlaceSearchError ? error.message : 'Search failed. Please try again.' });
    } finally { if (revision.current === current) pending.current = null; }
  }, []);
  return { state, search, cancel };
}
