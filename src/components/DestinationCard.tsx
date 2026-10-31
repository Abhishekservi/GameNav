import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, hud } from './HUD';
import type { Place } from '../search/places';
import { formatDistance, formatDuration, ROUTING_CREDIT, ROUTING_CREDIT_URL } from '../routing/routes';
import type { RouteState } from '../routing/useDrivingRoute';

export function DestinationCard({ place, moving, onView, onChange, onClear, routing, canRoute, startChanged, onRoute, onCancel }: { place: Place; moving: boolean; onView: () => void; onChange: () => void; onClear: () => void; routing: RouteState; canRoute: boolean; startChanged: boolean; onRoute: () => void; onCancel: () => void }) {
  const route = routing.route;
  const actions = [{ label: route ? 'VIEW ROUTE' : 'VIEW PIN', onPress: onView }, { label: 'CHANGE', onPress: onChange }, { label: 'CLEAR', onPress: onClear }];
  return <View style={s.card}>
    <Text style={s.eyebrow}>{route ? 'DRIVING ROUTE PREVIEW' : 'DESTINATION PIN'}</Text>
    <Text style={s.name} numberOfLines={moving ? 1 : 2}>{place.name}</Text>
    {!moving && !!place.address && <Text style={hud.muted} numberOfLines={2}>{place.address}</Text>}
    {route ? <>
      <Text style={s.estimate}>{formatDistance(route.distance)} · ~{formatDuration(route.duration)}</Text>
      <Text style={s.note}>{startChanged ? 'Start position changed. Recalculate when stopped.' : 'Estimate at calculation · no live traffic or turn guidance'}</Text>
      {!moving && Math.max(route.startOffset, route.endOffset) > 30 && <Text style={s.note}>Road access: {formatDistance(route.startOffset)} from start · {formatDistance(route.endOffset)} from pin. Access paths aren’t included.</Text>}
    </> : <Text accessibilityLiveRegion="polite" style={s.note}>{routing.status === 'error' ? routing.message : routing.status === 'loading' ? 'Finding a driving route…' : 'Route not calculated'}</Text>}
    {!moving && <>
      <Pressable accessibilityRole="button" accessibilityLabel={routing.status === 'loading' ? 'Cancel route calculation' : route ? 'Recalculate driving route' : 'Get driving route'} disabled={routing.status !== 'loading' && !canRoute} onPress={routing.status === 'loading' ? onCancel : onRoute} style={({ pressed }) => [s.routeButton, (pressed || (!canRoute && routing.status !== 'loading')) && { opacity: 0.45 }]}>
        {routing.status === 'loading' && <ActivityIndicator color="#131313" size="small" />}<Text style={s.routeButtonText}>{routing.status === 'loading' ? 'CANCEL' : route ? 'RECALCULATE ROUTE' : routing.status === 'error' ? 'RETRY DRIVING ROUTE' : 'GET DRIVING ROUTE'}</Text>
      </Pressable>
      {!canRoute && <Text style={s.note}>A fresh, precise GPS position is needed to calculate.</Text>}
      <Text style={s.note}>Request shares GPS and destination with {ROUTING_CREDIT}.</Text>
      <View style={s.credits}>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(ROUTING_CREDIT_URL).catch(() => {}); }} style={s.credit}><Text style={s.creditText}>Routes: {ROUTING_CREDIT}</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://www.openstreetmap.org/fixthemap').catch(() => {}); }} style={s.credit}><Text style={s.creditText}>Fix the map ↗</Text></Pressable>
      </View>
    </>}
    {moving && route && <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(ROUTING_CREDIT_URL).catch(() => {}); }} style={s.credit}><Text style={s.creditText}>Routes: {ROUTING_CREDIT} · © OpenStreetMap</Text></Pressable>}
    {!moving && <View style={s.actions}>
      {actions.map(({ label, onPress }) => <Pressable key={label} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.action, pressed && { opacity: 0.5 }]}><Text style={s.actionText}>{label}</Text></Pressable>)}
    </View>}
  </View>;
}

const s = StyleSheet.create({
  card: { padding: 12, borderWidth: 1, borderLeftWidth: 3, borderColor: colors.border, borderLeftColor: '#b56bff', backgroundColor: colors.panel, gap: 4 },
  eyebrow: { color: '#c594ff', fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  note: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  estimate: { color: colors.text, fontSize: 22, fontWeight: '800', marginVertical: 3 },
  routeButton: { minHeight: 44, backgroundColor: '#b56bff', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 5 },
  routeButtonText: { color: '#131313', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  credits: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  credit: { minHeight: 44, justifyContent: 'center' },
  creditText: { color: colors.muted, fontSize: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  actionText: { color: colors.text, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});
