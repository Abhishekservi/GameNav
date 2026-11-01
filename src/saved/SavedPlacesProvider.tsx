import { File, Paths } from 'expo-file-system';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Place } from '../search/places';
import { createSavedPlacesStore, parseSavedPlaces, type SavedPlaces, type SavedSlot } from './places';

const store = createSavedPlacesStore({
  read: async () => {
    const file = new File(Paths.document, 'gamenav-saved-places.json');
    const backup = new File(Paths.document, 'gamenav-saved-places.backup');
    const readValid = async (source: File) => {
      if (source.size > 30000) throw new Error('Saved places are unreadable.');
      const text = await source.text(); parseSavedPlaces(text); return text;
    };
    if (file.exists) {
      try { return await readValid(file); }
      catch (error) { if (!backup.exists) throw error; }
    }
    return backup.exists ? readValid(backup) : null;
  },
  write: async text => {
    const pending = new File(Paths.document, 'gamenav-saved-places.pending');
    await pending.write(text);
    const file = new File(Paths.document, 'gamenav-saved-places.json');
    if (file.exists) {
      // Retain a valid previous version if replacement is interrupted.
      let valid = false;
      try { parseSavedPlaces(await file.text()); valid = true; } catch { /* Keep the recovery copy. */ }
      if (valid) await file.copy(new File(Paths.document, 'gamenav-saved-places.backup'), { overwrite: true });
    }
    await pending.move(file, { overwrite: true });
  },
});
type State = { places: SavedPlaces; status: 'loading' | 'ready' | 'error'; busy: boolean };
type Value = State & { reload: () => void; save: (slot: SavedSlot, place: Place) => Promise<void>; remove: (slot: SavedSlot) => Promise<void> };
const Context = createContext<Value | null>(null);

export function SavedPlacesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ places: {}, status: 'loading', busy: false });
  useEffect(() => {
    let active = true;
    void store.load().then(places => { if (active) setState({ places, status: 'ready', busy: false }); }, () => { if (active) setState(current => ({ ...current, status: 'error' })); });
    return () => { active = false; };
  }, []);
  const reload = useCallback(() => {
    setState(current => ({ ...current, status: 'loading' }));
    void store.load().then(places => setState({ places, status: 'ready', busy: false }), () => setState(current => ({ ...current, status: 'error' })));
  }, []);
  const save = useCallback(async (slot: SavedSlot, place: Place) => {
    setState(current => ({ ...current, busy: true }));
    try { const places = await store.save(slot, place); setState({ places, status: 'ready', busy: false }); }
    catch { setState(current => ({ ...current, busy: false })); throw new Error('Could not save this place. Please try again.'); }
  }, []);
  const remove = useCallback(async (slot: SavedSlot) => {
    setState(current => ({ ...current, busy: true }));
    try { const places = await store.remove(slot); setState({ places, status: 'ready', busy: false }); }
    catch { setState(current => ({ ...current, busy: false })); throw new Error('Could not remove this place. Please try again.'); }
  }, []);
  const value = useMemo(() => ({ ...state, reload, save, remove }), [state, reload, save, remove]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSavedPlaces() {
  const value = useContext(Context);
  if (!value) throw new Error('SavedPlacesProvider is required');
  return value;
}
