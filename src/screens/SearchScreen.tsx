import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useGPSState } from '../location/GPSProvider';
import { useDestination } from '../search/DestinationProvider';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, createSuggestionScheduler, normalizeQuery, type Place } from '../search/places';
import { usePlaceSearch } from '../search/usePlaceSearch';
import { MissionBadge, SavedPlaceShortcuts } from '../components/SavedPlaces';
import { useSavedPlaces } from '../saved/SavedPlacesProvider';
import { SAVED_SLOTS, type SavedSlot } from '../saved/places';

function closeSearch() {
  Keyboard.dismiss();
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function SearchScreen() {
  return <SafeAreaProvider><SearchContent /></SafeAreaProvider>;
}

function SearchContent() {
  const { select } = useDestination();
  const saved = useSavedPlaces();
  const gps = useGPSState();
  const moving = (gps.fix?.coords.speed ?? 0) > 2.2;
  const [query, setQuery] = useState('');
  const [assigning, setAssigning] = useState<SavedSlot | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const assigningSlot = SAVED_SLOTS.find(slot => slot.key === assigning);
  const canUseCurrent = gps.fresh && gps.fix?.coords.accuracy !== null && (gps.fix?.coords.accuracy ?? Infinity) <= 35;
  const { state, search, cancel } = usePlaceSearch();
  const scheduler = useMemo(() => createSuggestionScheduler(value => { void search(value); }), [search]);
  const loading = state.status === 'loading';
  const valid = normalizeQuery(query).length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!moving) scheduler.schedule(query);
    return () => scheduler.cancel();
  }, [query, moving, scheduler]);
  useEffect(() => { if (moving) { cancel(); Keyboard.dismiss(); } }, [moving, cancel]);

  const submit = () => {
    if (!moving && valid) { scheduler.submit(query); Keyboard.dismiss(); }
  };
  const choose = async (place: Place) => {
    if (moving || saved.busy) return;
    scheduler.cancel();
    if (assigning) {
      try { await saved.save(assigning, place); }
      catch (error) { Alert.alert('Place not saved', error instanceof Error ? error.message : 'Please try again.'); return; }
    }
    select(place);
    closeSearch();
  };
  const changeQuery = (value: string) => { scheduler.cancel(); cancel(); setQuery(value); };
  const setup = (slot: SavedSlot) => {
    if (moving || saved.busy || saved.status !== 'ready') return;
    changeQuery(''); setAssigning(slot); input.current?.focus();
  };
  const useCurrentLocation = () => {
    if (moving || !canUseCurrent || !gps.fix || !assigningSlot) return;
    void choose({ id: `local:${assigningSlot.key}`, name: assigningSlot.label, address: 'Pinned location', category: 'saved', zoom: 17, coordinates: [gps.fix.coords.longitude, gps.fix.coords.latitude] });
  };

  return <SafeAreaView style={s.screen}>
    <KeyboardAvoidingView style={s.content} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.header}>
        <View style={s.inputRow}>
          <Text style={s.searchGlyph}>⌕</Text>
          <TextInput accessibilityLabel="Search places or addresses" accessibilityHint="Suggestions appear after three characters."
            ref={input} value={query} onChangeText={changeQuery} onSubmitEditing={submit}
            placeholder="Search places" placeholderTextColor="#9697a1"
            editable={!moving && !saved.busy} autoFocus={!moving} selectTextOnFocus autoCorrect={false} autoComplete="off" autoCapitalize="words"
            returnKeyType="search" submitBehavior="submit" enablesReturnKeyAutomatically maxLength={MAX_QUERY_LENGTH}
            selectionColor="#c7a6ff" style={s.input} />
          {loading ? <ActivityIndicator accessibilityLabel="Finding suggestions" size="small" color="#c7a6ff" style={s.spinner} /> : !!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" disabled={moving} onPress={() => changeQuery('')} style={s.clear}><Text style={s.clearGlyph}>×</Text></Pressable>}
        </View>
        <Pressable disabled={saved.busy} onPress={closeSearch} accessibilityRole="button" accessibilityLabel="Cancel search" style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
      </View>
      {assigningSlot ? <View style={s.setup}>
        <MissionBadge small slot={assigningSlot.key} /><Text style={s.setupTitle}>Set {assigningSlot.label}</Text>
        <Pressable accessibilityRole="button" disabled={moving || !canUseCurrent || saved.busy} onPress={useCurrentLocation} style={[s.useCurrent, (!canUseCurrent || moving || saved.busy) && { opacity: 0.45 }]}><Text style={s.cancelText}>{saved.busy ? 'Saving…' : 'Use my location'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel saving a place" disabled={saved.busy} onPress={() => { setAssigning(null); changeQuery(''); }} style={s.clear}><Text style={s.clearGlyph}>×</Text></Pressable>
      </View> : <SavedPlaceShortcuts disabled={moving} onSelect={place => { void choose(place); }} onSetup={setup} />}
      {moving ? <Text style={s.status}>Stop safely to search.</Text> : <FlatList
        style={s.list} data={state.places} keyExtractor={place => place.id}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={8}
        contentContainerStyle={s.results}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Select ${item.name}. ${item.address}`} disabled={saved.busy} onPress={() => { void choose(item); }} style={({ pressed }) => [s.result, (pressed || saved.busy) && { opacity: 0.5 }]}>
          <View style={s.pinDot} /><View style={s.resultContent}><Text numberOfLines={1} style={s.resultName}>{item.name}</Text><Text numberOfLines={1} style={s.address}>{item.address || item.category}</Text></View><Text style={s.chevron}>›</Text>
        </Pressable>}
        ListEmptyComponent={state.status === 'error' ? <View style={s.error}><Text style={s.status}>{state.message}</Text><Pressable accessibilityRole="button" onPress={submit} style={s.retry}><Text style={s.cancelText}>Try again</Text></Pressable></View> : state.status === 'success' ? <Text style={s.status}>No places found</Text> : undefined}
      />}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#191a1f' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  setup: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60 },
  setupTitle: { flex: 1, color: '#f5f5f7', fontSize: 14, fontWeight: '600' },
  useCurrent: { minHeight: 44, justifyContent: 'center' },
  inputRow: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 24, backgroundColor: '#292a31', minHeight: 48 },
  searchGlyph: { color: '#9697a1', fontSize: 25, paddingLeft: 13 },
  input: { flex: 1, color: '#fafafa', paddingVertical: 12, paddingLeft: 8, fontSize: 16, minHeight: 48 },
  clear: { width: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  clearGlyph: { color: '#bfc0c7', fontSize: 23 },
  spinner: { marginHorizontal: 12 },
  cancel: { minHeight: 48, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#c7a6ff', fontSize: 15, fontWeight: '500' },
  list: { flex: 1 },
  results: { paddingBottom: 8 },
  result: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, minHeight: 70, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#35363d' },
  pinDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#a98ade', marginLeft: 6 },
  resultContent: { flex: 1, gap: 5 },
  resultName: { color: '#fafafa', fontSize: 16, fontWeight: '500' },
  address: { color: '#a9aab3', fontSize: 12, lineHeight: 17 },
  chevron: { color: '#a9aab3', fontSize: 22 },
  status: { color: '#a9aab3', fontSize: 14, lineHeight: 21, paddingTop: 20 },
  error: { gap: 4 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
