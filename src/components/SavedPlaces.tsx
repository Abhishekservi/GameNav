import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Place } from '../search/places';
import { useSavedPlaces } from '../saved/SavedPlacesProvider';
import { SAVED_SLOTS, slotForPlace, type SavedSlot } from '../saved/places';

export function MissionBadge({ slot, small = false }: { slot: SavedSlot; small?: boolean }) {
  const item = SAVED_SLOTS.find(item => item.key === slot)!;
  return <View style={[s.badge, small && s.smallBadge, { borderColor: item.color }]}><Text style={[s.letter, small && s.smallLetter, { color: item.color }]}>{item.letter}</Text></View>;
}

export function SavedPlaceShortcuts({ disabled, onSelect, onSetup }: { disabled: boolean; onSelect: (place: Place) => void; onSetup: (slot: SavedSlot) => void }) {
  const saved = useSavedPlaces();
  const unavailable = disabled || saved.status !== 'ready' || saved.busy;
  const manage = (key: SavedSlot) => {
    if (unavailable) return;
    const slot = SAVED_SLOTS.find(item => item.key === key)!;
    if (!saved.places[key]) { onSetup(key); return; }
    Alert.alert(slot.label, saved.places[key]!.name, [
      { text: 'Change place', onPress: () => onSetup(key) },
      { text: 'Remove', style: 'destructive', onPress: () => { void saved.remove(key).catch(error => Alert.alert('Could not remove place', error.message)); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  return <View>
    <View style={s.shortcuts}>{SAVED_SLOTS.map(slot => <Pressable key={slot.key} accessibilityRole="button" accessibilityLabel={saved.places[slot.key] ? `${slot.label}, ${saved.places[slot.key]!.name}` : `Set ${slot.label}`} accessibilityHint="Hold to change or remove this place" disabled={unavailable} onLongPress={() => manage(slot.key)} onPress={() => { const place = saved.places[slot.key]; if (place) onSelect(place); else onSetup(slot.key); }} style={({ pressed }) => [s.shortcut, (pressed || unavailable) && s.dim]}>
      <MissionBadge slot={slot.key} />
      <Text style={s.shortcutTitle}>{slot.label}</Text><Text numberOfLines={1} style={s.subtitle}>{saved.places[slot.key]?.name ?? 'Set place'}</Text>
    </Pressable>)}</View>
    {saved.status === 'loading' && <ActivityIndicator accessibilityLabel="Loading saved places" size="small" color="#c7a6ff" />}
    {saved.status === 'error' && <Pressable accessibilityRole="button" onPress={saved.reload} style={s.retry}><Text style={s.subtitle}>Saved places unavailable · Retry</Text></Pressable>}
  </View>;
}

export function SavePlaceButton({ place, disabled }: { place: Place; disabled: boolean }) {
  const saved = useSavedPlaces();
  const [open, setOpen] = useState(false);
  const current = slotForPlace(saved.places, place);
  const blocked = disabled || saved.busy || saved.status !== 'ready';
  const persist = async (slot: SavedSlot) => {
    if (blocked) return;
    try { await saved.save(slot, place); setOpen(false); }
    catch (error) { Alert.alert('Place not saved', error instanceof Error ? error.message : 'Please try again.'); }
  };
  const chooseSlot = (slot: SavedSlot) => {
    if (blocked) return;
    const existing = saved.places[slot];
    if (existing && slotForPlace({ [slot]: existing }, place) !== slot) Alert.alert(`Replace ${SAVED_SLOTS.find(item => item.key === slot)!.label}?`, existing.name, [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', onPress: () => { void persist(slot); } }]);
    else void persist(slot);
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={current ? 'Manage saved place' : 'Save place as Home, Work or Shop'} disabled={blocked} onPress={() => setOpen(true)} style={[s.save, blocked && s.dim]}>{current ? <MissionBadge small slot={current} /> : <Text style={s.saveGlyph}>☆</Text>}</Pressable>
    <Modal visible={open && !disabled} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.scrim}><View accessibilityViewIsModal style={s.sheet}>
        <Text style={s.title}>Save place as</Text><Text numberOfLines={1} style={s.placeName}>{place.name}</Text>
        <ScrollView>{SAVED_SLOTS.map(slot => <Pressable key={slot.key} accessibilityRole="button" disabled={blocked} onPress={() => chooseSlot(slot.key)} style={[s.slot, blocked && s.dim]}><MissionBadge slot={slot.key} /><View style={s.slotInfo}><Text style={s.slotTitle}>{slot.label}</Text><Text numberOfLines={1} style={s.subtitle}>{saved.places[slot.key]?.name ?? 'Not set'}</Text></View>{current === slot.key && <Text style={s.check}>✓</Text>}</Pressable>)}</ScrollView>
        {saved.busy && <ActivityIndicator accessibilityLabel="Saving place" color="#c7a6ff" />}
        {current && <Pressable accessibilityRole="button" disabled={blocked} onPress={() => { void saved.remove(current).then(() => setOpen(false), error => Alert.alert('Could not remove place', error.message)); }} style={s.cancel}><Text style={s.removeText}>Remove {SAVED_SLOTS.find(item => item.key === current)!.label}</Text></Pressable>}
        <Pressable accessibilityRole="button" disabled={saved.busy} onPress={() => setOpen(false)} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
      </View></View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  shortcuts: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
  shortcut: { flex: 1, minHeight: 100, alignItems: 'center', padding: 10, gap: 5, backgroundColor: '#23242b', borderRadius: 18, borderWidth: 1, borderColor: '#34353e' },
  shortcutTitle: { color: '#f5f5f7', fontSize: 14, fontWeight: '600' },
  subtitle: { color: '#a9aab3', fontSize: 11, lineHeight: 16 },
  badge: { width: 36, height: 36, borderRadius: 9, borderWidth: 2, backgroundColor: '#15161b', alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 24, fontWeight: '900', fontStyle: 'italic' },
  smallBadge: { width: 28, height: 28, borderRadius: 7 },
  smallLetter: { fontSize: 18 },
  dim: { opacity: 0.45 },
  retry: { minHeight: 44, justifyContent: 'center' },
  save: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  saveGlyph: { color: '#ffd66b', fontSize: 30 },
  scrim: { flex: 1, backgroundColor: '#0009', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: '#202126', borderRadius: 24, padding: 20, width: '100%', maxWidth: 380, maxHeight: '80%', borderWidth: 1, borderColor: '#45454f' },
  title: { color: '#fafafa', fontSize: 21, fontWeight: '700' },
  placeName: { color: '#a9aab3', fontSize: 13, marginVertical: 8 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#45454f' },
  slotInfo: { flex: 1, gap: 4 },
  slotTitle: { color: '#fafafa', fontSize: 16, fontWeight: '500' },
  check: { color: '#ffd66b', fontSize: 22 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { color: '#c7a6ff', fontSize: 16 },
  removeText: { color: '#ffb4bd', fontSize: 15 },
});
