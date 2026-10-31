import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, hud } from './HUD';
import type { Place } from '../search/places';

export function DestinationCard({ place, moving, onView, onChange, onClear }: { place: Place; moving: boolean; onView: () => void; onChange: () => void; onClear: () => void }) {
  const actions = [{ label: 'VIEW PIN', onPress: onView }, { label: 'CHANGE', onPress: onChange }, { label: 'CLEAR', onPress: onClear }];
  return <View style={s.card}>
    <Text style={s.eyebrow}>DESTINATION PIN</Text>
    <Text style={s.name} numberOfLines={moving ? 1 : 2}>{place.name}</Text>
    {!moving && !!place.address && <Text style={hud.muted} numberOfLines={2}>{place.address}</Text>}
    <Text style={s.note}>Route not calculated</Text>
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
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  actionText: { color: colors.text, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});
