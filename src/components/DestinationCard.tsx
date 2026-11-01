import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Place } from '../search/places';
import { formatDistance, formatDuration, ROUTING_CREDIT, ROUTING_CREDIT_URL } from '../routing/routes';
import type { RouteState } from '../routing/useDrivingRoute';
import { SavePlaceButton } from './SavedPlaces';

function openCredit(url: string) {
  void Linking.openURL(url).catch(() => Alert.alert('Link unavailable', 'Please try again when you have a connection.'));
}

type Props = { place: Place; moving: boolean; onView: () => void; onChange: () => void; onClear: () => void; routing: RouteState; canRoute: boolean; startChanged: boolean; onRoute: () => void; onCancel: () => void; onStart: () => void; startError: string | null };

export function DestinationCard({ place, moving, onView, onChange, onClear, routing, canRoute, startChanged, onRoute, onCancel, onStart, startError }: Props) {
  const [details, setDetails] = useState(false);
  const { height } = useWindowDimensions();
  const route = routing.route;
  const loading = routing.status === 'loading';
  const needsRecalculation = !!route && startChanged;
  const primaryDisabled = loading ? false : route && !needsRecalculation ? !!startError : !canRoute;
  const primaryLabel = loading ? 'Cancel' : needsRecalculation ? 'Recalculate' : route ? 'Start journey' : routing.status === 'error' ? 'Try again' : 'Directions';
  const showDetails = details && !moving;
  return <View style={s.card}>
    <View style={s.header}>
      <Text numberOfLines={1} style={s.name}>{place.name}</Text>
      {!moving && <SavePlaceButton place={place} disabled={moving} />}
      {!moving && <Pressable accessibilityRole="button" accessibilityLabel="Clear destination and route" onPress={onClear} style={s.close}><Text style={s.closeText}>×</Text></Pressable>}
    </View>
    {route ? <>
      <View style={s.summary}><Text style={s.duration}>~{formatDuration(route.duration)}</Text><Text style={s.distance}>{formatDistance(route.distance)}</Text></View>
      <Text style={s.note}>{needsRecalculation ? 'Update the route from your current location' : startError || 'On-screen guidance · no live traffic'}</Text>
    </> : <Text accessibilityLiveRegion="polite" style={s.note}>{routing.status === 'error' ? routing.message : loading ? 'Finding a driving route…' : !canRoute ? 'Waiting for a precise GPS position' : 'Get a driving route from your location'}</Text>}
    {!moving && <>
      <View style={s.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={primaryLabel} accessibilityState={{ disabled: primaryDisabled }} disabled={primaryDisabled} onPress={loading ? onCancel : route && !needsRecalculation ? onStart : onRoute} style={({ pressed }) => [s.primary, (pressed || primaryDisabled) && s.dim]}>
          {loading && <ActivityIndicator color="#ffffff" size="small" />}<Text style={s.primaryText}>{primaryLabel}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={route ? onView : onChange} style={s.secondary}><Text style={s.secondaryText}>{route ? 'Overview' : 'Change'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={showDetails ? 'Hide route details' : 'Show route details'} accessibilityState={{ expanded: showDetails }} onPress={() => setDetails(value => !value)} style={s.secondary}><Text style={s.secondaryText}>{showDetails ? 'Less' : 'Details'}</Text></Pressable>
      </View>
      {!route && <Text style={s.disclosure}>Uses your current GPS position</Text>}
    </>}
    {showDetails && <ScrollView style={{ maxHeight: height * 0.25 }} contentContainerStyle={s.details} showsVerticalScrollIndicator>
      {!!place.address && <Text style={s.note}>{place.address}</Text>}
      {route && <>
        <Text style={s.note}>Estimates are totals at calculation, not remaining travel time.</Text>
        <Pressable accessibilityRole="button" onPress={onChange} style={s.detailButton}><Text style={s.secondaryText}>Change destination</Text></Pressable>
        <Text style={s.note}>Road access: {formatDistance(route.startOffset)} from start, {formatDistance(route.endOffset)} from pin. Access paths are not included.</Text>
        <Pressable accessibilityRole="button" disabled={!canRoute} onPress={onRoute} style={[s.detailButton, !canRoute && s.dim]}><Text style={s.secondaryText}>Recalculate from my location</Text></Pressable>
      </>}
      {!route && <Pressable accessibilityRole="button" onPress={onView} style={s.detailButton}><Text style={s.secondaryText}>Show destination pin</Text></Pressable>}
      <Text style={s.note}>A route request shares your GPS position and destination with {ROUTING_CREDIT}.</Text>
      <Pressable accessibilityRole="link" onPress={() => openCredit(ROUTING_CREDIT_URL)} style={s.detailButton}><Text style={s.secondaryText}>About {ROUTING_CREDIT} ↗</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => openCredit('https://www.openstreetmap.org/fixthemap')} style={s.detailButton}><Text style={s.secondaryText}>Report a map issue ↗</Text></Pressable>
    </ScrollView>}
  </View>;
}

const s = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 10, borderRadius: 24, backgroundColor: '#202126', borderWidth: 1, borderColor: '#3b3c43', boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.24)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  name: { flex: 1, color: '#fafafa', fontSize: 17, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  closeText: { color: '#bfc0c7', fontSize: 25 },
  summary: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 4, flexWrap: 'wrap' },
  duration: { color: '#c7a6ff', fontSize: 27, fontWeight: '700' },
  distance: { color: '#dedee3', fontSize: 16 },
  note: { color: '#bfc0c7', fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primary: { flex: 1.2, minHeight: 44, backgroundColor: '#7955d9', borderRadius: 22, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12 },
  primaryText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  secondary: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: '#32333a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  secondaryText: { color: '#e5dcff', fontSize: 13, fontWeight: '500' },
  dim: { opacity: 0.45 },
  disclosure: { color: '#a9aab3', fontSize: 10, lineHeight: 16 },
  details: { paddingTop: 12, paddingBottom: 4, gap: 8 },
  detailButton: { minHeight: 44, justifyContent: 'center' },
});
