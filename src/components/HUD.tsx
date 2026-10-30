import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapTheme } from '../maps/style';

export const colors = { cyan: '#78edee', text: '#edf4f6', muted: '#a2b5c3', panel: '#101c27', border: '#304351', amber: '#ffce85' };

export function Control({ label, glyph, active = false, onPress }: { label: string; glyph: string; active?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [s.control, active && s.controlActive, pressed && s.pressed]}>
    <Text style={[s.glyph, active && { color: colors.cyan }]}>{glyph}</Text>
  </Pressable>;
}

export function ThemeSwitcher({ theme, onChange, disabled }: { theme: MapTheme; onChange: (theme: MapTheme) => void; disabled: boolean }) {
  return <View accessibilityRole="tablist" style={s.switcher}>{(['classic', 'arcade'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value === 'arcade' ? 'Arcade City theme' : 'Classic theme'} accessibilityState={{ selected: value === theme, disabled }} disabled={disabled} onPress={() => onChange(value)} style={({ pressed }) => [s.theme, value === theme && s.selected, pressed && s.pressed]}>
    <Text style={[s.themeText, value === theme && s.selectedText]}>{value === 'classic' ? 'Classic' : 'Arcade City'}</Text>
  </Pressable>)}</View>;
}

export function Notice({ title, detail, action, onPress, loading = false }: { title: string; detail?: string; action?: string; onPress?: () => void; loading?: boolean }) {
  return <View style={s.notice} accessibilityLiveRegion="polite">
    <View style={s.noticeTop}>{loading ? <ActivityIndicator color={colors.cyan} /> : <View style={s.noticeDot} />}<Text style={s.noticeTitle}>{title}</Text></View>
    {detail && <Text style={s.detail}>{detail}</Text>}
    {action && onPress && <Pressable accessibilityRole="button" onPress={onPress} style={s.action}><Text style={s.actionText}>{action}</Text></Pressable>}
  </View>;
}

export function SpeedDisplay({ speed, children }: { speed: number | null; children: ReactNode }) {
  return <View style={s.driveCard}>
    <View accessibilityLabel={speed === null ? 'Speed unavailable' : `${speed} kilometers per hour`} style={s.speedBlock}>
      <Text maxFontSizeMultiplier={1.3} adjustsFontSizeToFit numberOfLines={1} style={s.speed}>{speed === null ? '—' : speed.toString().padStart(2, '0')}</Text><Text style={s.unit}>KM/H</Text>
    </View>
    <View style={s.driveInfo}>{children}</View>
  </View>;
}

export const hud = StyleSheet.create({
  text: { color: colors.text },
  eyebrow: { color: colors.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 2.2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  strong: { color: colors.text, fontSize: 17, fontWeight: '700' },
});

const s = StyleSheet.create({
  control: { width: 52, height: 52, borderRadius: 17, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  controlActive: { borderColor: '#5bb6c1', backgroundColor: '#173440' },
  glyph: { color: colors.text, fontSize: 27, fontWeight: '600' },
  pressed: { opacity: 0.65 },
  switcher: { flexDirection: 'row', padding: 4, backgroundColor: '#0e1822', borderRadius: 17, borderWidth: 1, borderColor: colors.border },
  theme: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  selected: { backgroundColor: colors.cyan },
  themeText: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  selectedText: { color: '#092029' },
  notice: { borderRadius: 16, backgroundColor: '#152431', borderWidth: 1, borderColor: colors.border, padding: 13, gap: 5 },
  noticeTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.amber },
  noticeTitle: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 13 },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  actionText: { color: colors.cyan, fontWeight: '700', fontSize: 14 },
  driveCard: { flexDirection: 'row', alignItems: 'center', padding: 17, backgroundColor: colors.panel, borderRadius: 23, borderWidth: 1, borderColor: colors.border, gap: 18 },
  speedBlock: { minWidth: 82, alignItems: 'center', paddingRight: 18, borderRightWidth: 1, borderColor: colors.border },
  speed: { fontSize: 43, fontWeight: '700', fontVariant: ['tabular-nums'], color: colors.text, letterSpacing: -2 },
  unit: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  driveInfo: { flex: 1, gap: 6 },
});
