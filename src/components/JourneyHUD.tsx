import { useKeepAwake } from 'expo-keep-awake';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDistance } from '../routing/routes';
import type { JourneyReading } from '../routing/journey';

export function JourneyAwake() { useKeepAwake('GameNavJourney'); return null; }

export function TurnBanner({ reading }: { reading: JourneyReading }) {
  const status = reading.status;
  const instruction = status === 'tracking' ? reading.instruction : null;
  const title = status === 'waiting' ? 'Waiting for accurate GPS' : status === 'off-route' ? 'You are away from the route' : status === 'uncertain' ? 'Checking your route position' : status === 'complete' ? 'Driving route complete' : instruction?.text || 'Follow the route';
  return <View accessibilityLiveRegion="polite" style={s.banner}>
    <Text style={s.arrow}>{instruction?.glyph || (status === 'complete' ? '⚑' : '◎')}</Text>
    <View style={s.turnInfo}>
      {instruction && <Text style={s.turnDistance}>{instruction.distance < 15 ? 'Now' : `In ${formatDistance(instruction.distance)}`}</Text>}
      <Text numberOfLines={2} style={s.turn}>{title}</Text>
      {!!instruction?.road && <Text numberOfLines={1} style={s.road}>{instruction.road}</Text>}
      {!instruction && status !== 'complete' && <Text style={s.road}>{status === 'off-route' ? 'Stop safely to recalculate.' : 'Turn prompts are paused.'}</Text>}
    </View>
  </View>;
}

export function JourneyCard({ name, reading, moving, onEnd, onOverview, onRecalculate }: { name: string; reading: JourneyReading; moving: boolean; onEnd: () => void; onOverview: () => void; onRecalculate: () => void }) {
  return <View style={s.card}>
    <Text numberOfLines={1} style={s.destination}>{name}</Text>
    <Text style={s.remaining}>{reading.status === 'complete' ? 'Driving route complete' : reading.remaining === null ? 'Distance paused' : `~${formatDistance(reading.remaining)} remaining`}</Text>
    <Text style={s.note}>{reading.status === 'complete' && reading.distanceToPin !== null && reading.distanceToPin > 30 ? `Destination pin is ${formatDistance(reading.distanceToPin)} away. Access path not included.` : 'On-screen guidance · keep GameNav open'}</Text>
    <View style={s.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="End journey" onPress={onEnd} style={s.end}><Text style={s.endText}>End journey</Text></Pressable>
      {!moving && <Pressable accessibilityRole="button" onPress={reading.status === 'off-route' || reading.status === 'uncertain' ? onRecalculate : onOverview} style={s.secondary}><Text style={s.secondaryText}>{reading.status === 'off-route' || reading.status === 'uncertain' ? 'Recalculate' : 'Overview'}</Text></Pressable>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  banner: { flexDirection: 'row', gap: 14, backgroundColor: '#252332', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#4b4160' },
  arrow: { color: '#d3b8ff', fontSize: 40, width: 48, textAlign: 'center', alignSelf: 'center' },
  turnInfo: { flex: 1, gap: 4 },
  turnDistance: { color: '#d3b8ff', fontSize: 20, fontWeight: '700' },
  turn: { color: '#fafafa', fontSize: 17, fontWeight: '600' },
  road: { color: '#c3c0cd', fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: '#202126', borderRadius: 24, padding: 16, gap: 5, borderWidth: 1, borderColor: '#3b3c43' },
  destination: { color: '#c3c0cd', fontSize: 13 },
  remaining: { color: '#fafafa', fontWeight: '700', fontSize: 22 },
  note: { color: '#a9aab3', fontSize: 11, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  end: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: '#7c364b', justifyContent: 'center', alignItems: 'center' },
  endText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  secondary: { flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: '#32333a', justifyContent: 'center', alignItems: 'center' },
  secondaryText: { color: '#e5dcff', fontWeight: '500', fontSize: 14 },
});
