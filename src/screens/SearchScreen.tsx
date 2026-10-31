import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Notice, colors, hud } from '../components/HUD';
import { useGPSState } from '../location/GPSProvider';
import { useDestination } from '../search/DestinationProvider';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, SEARCH_PROVIDER, normalizeQuery, type Place } from '../search/places';
import { usePlaceSearch } from '../search/usePlaceSearch';

const examples = ['Gateway of India', 'Bandra station', 'Mumbai airport'];

function closeSearch() {
  Keyboard.dismiss();
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function SearchScreen() {
  // Native modal presentations need measurements from their own view root.
  return <SafeAreaProvider><SearchContent /></SafeAreaProvider>;
}

function SearchContent() {
  const { destination, select } = useDestination();
  const gps = useGPSState();
  const moving = (gps.fix?.coords.speed ?? 0) > 2.2;
  const [query, setQuery] = useState(destination?.name ?? '');
  const { state, search, cancel } = usePlaceSearch();
  const loading = state.status === 'loading';
  const valid = normalizeQuery(query).length >= MIN_QUERY_LENGTH;

  useEffect(() => { if (moving) Keyboard.dismiss(); }, [moving]);

  const submit = (value = query) => {
    if (moving || normalizeQuery(value).length < MIN_QUERY_LENGTH) return;
    setQuery(value);
    Keyboard.dismiss();
    void search(value);
  };
  const choose = (place: Place) => {
    if (moving) return;
    select(place);
    closeSearch();
  };
  const changeQuery = (value: string) => { cancel(); setQuery(value); };
  const resultsHeading = state.status === 'success' ? `${state.places.length} ${state.places.length === 1 ? 'PLACE' : 'PLACES'} FOUND` : 'SEARCH THE CITY';

  return <SafeAreaView style={s.screen}>
    <KeyboardAvoidingView style={s.content} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.header}>
        <Pressable onPress={closeSearch} accessibilityRole="button" accessibilityLabel="Close destination search" style={s.close}><Text style={s.closeGlyph}>×</Text></Pressable>
        <View style={{ flex: 1, gap: 5 }}><Text style={hud.eyebrow}>GAMENAV / DESTINATION</Text><Text style={s.title}>Where to?</Text></View>
      </View>

      <View style={s.inputRow}>
        <TextInput
          accessibilityLabel="Place or address"
          accessibilityHint="Enter at least three characters, then press Search."
          value={query} onChangeText={changeQuery} onSubmitEditing={() => submit()}
          placeholder="Place, address, or landmark" placeholderTextColor="#8b8b8b"
          editable={!moving} autoFocus={!moving} autoCorrect={false} autoComplete="off" autoCapitalize="words"
          returnKeyType="search" submitBehavior="submit" enablesReturnKeyAutomatically maxLength={MAX_QUERY_LENGTH}
          selectionColor={colors.accent} style={s.input}
        />
        {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search text" disabled={moving} onPress={() => changeQuery('')} style={s.clear}><Text style={s.clearGlyph}>×</Text></Pressable>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Search places" accessibilityState={{ disabled: !valid || loading || moving, busy: loading }} disabled={!valid || loading || moving} onPress={() => submit()} style={({ pressed }) => [s.submit, (!valid || loading || moving || pressed) && s.dim]}>
        {loading ? <ActivityIndicator color="#111111" /> : <Text style={s.submitText}>SEARCH</Text>}
      </Pressable>
      <Text style={s.hint}>Mumbai results first. Add a city for places elsewhere.</Text>

      {moving ? <Notice title="Search paused while moving" detail="Stop safely to choose a destination. Your map and GPS remain available." /> : <>
        <View style={s.resultsHeading}><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={hud.eyebrow}>{loading ? 'FINDING PLACES…' : resultsHeading}</Text></View>
        <FlatList
          style={s.list} data={state.places} keyExtractor={place => place.id}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" initialNumToRender={8}
          contentContainerStyle={s.results}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Select ${item.name}. ${item.address}`} onPress={() => choose(item)} style={({ pressed }) => [s.result, pressed && s.dim]}>
            <View style={s.pinDot} />
            <View style={s.resultContent}><Text numberOfLines={2} style={s.resultName}>{item.name}</Text><Text numberOfLines={2} style={s.address}>{item.address || item.category}</Text><Text style={s.category}>{item.category}</Text></View>
            <Text style={s.chevron}>›</Text>
          </Pressable>}
          ListEmptyComponent={loading ? <Text style={s.emptyText}>Looking up “{state.query}”…</Text> : state.status === 'error' ? <Notice title="Search unavailable" detail={state.message} action="Try again" onPress={() => submit()} /> : state.status === 'success' ? <Notice title="No places found" detail="Try a nearby landmark, a street address, or add the city name." /> : <View style={s.empty}>
            <Text style={s.emptyTitle}>Find your next stop.</Text><Text style={s.emptyText}>Search for a place, street, or landmark. Select a result to place a destination pin on the map.</Text>
            <Text style={[hud.eyebrow, { marginTop: 12 }]}>TRY A MUMBAI LANDMARK</Text>
            {examples.map(example => <Pressable key={example} accessibilityRole="button" onPress={() => submit(example)} style={s.example}><Text style={s.exampleText}>{example}</Text><Text style={s.chevron}>↗</Text></Pressable>)}
          </View>}
        />
      </>}

      <View style={s.footer}>
        <Text style={s.routeNote}>Choose a pin now. Route guidance is not connected yet.</Text>
        <View style={s.attributionRow}>
          {[['Search by ' + SEARCH_PROVIDER, 'https://photon.komoot.io/'], ['© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright']].map(([label, url]) => <Pressable key={label} accessibilityRole="link" onPress={() => { void Linking.openURL(url).catch(() => Alert.alert('Link unavailable', 'Please try again when you have a connection.')); }} style={s.credit}><Text style={s.creditText}>{label}</Text></Pressable>)}
        </View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#131313' },
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  closeGlyph: { color: colors.text, fontSize: 30 },
  inputRow: { flexDirection: 'row', borderWidth: 1, borderColor: '#686868', backgroundColor: '#222222', minHeight: 54, alignItems: 'center' },
  input: { flex: 1, color: colors.text, padding: 14, fontSize: 16, minHeight: 54 },
  clear: { width: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  clearGlyph: { color: colors.muted, fontSize: 25 },
  submit: { marginTop: 10, minHeight: 48, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#131313', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  dim: { opacity: 0.45 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17, marginVertical: 10 },
  resultsHeading: { marginTop: 14, marginBottom: 8 },
  list: { flex: 1 },
  results: { paddingBottom: 18 },
  result: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 12, minHeight: 82, borderBottomWidth: 1, borderColor: '#353535' },
  pinDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: '#c594ff', backgroundColor: '#a64dff' },
  resultContent: { flex: 1, gap: 5 },
  resultName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  address: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  category: { color: '#c594ff', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  chevron: { color: colors.muted, fontSize: 23 },
  empty: { paddingTop: 12, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  example: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#353535', gap: 10 },
  exampleText: { color: colors.text, fontSize: 14 },
  footer: { paddingTop: 10, marginTop: 'auto', borderTopWidth: 1, borderColor: '#353535' },
  routeNote: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  attributionRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
  credit: { minHeight: 44, justifyContent: 'center' },
  creditText: { color: '#c9c9c9', fontSize: 10 },
});
