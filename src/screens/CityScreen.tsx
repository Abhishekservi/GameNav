import { Camera, Images, Layer, LayerAnnotation, LogManager, Map, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Control, Notice, SpeedDisplay, ThemeSwitcher, colors, hud } from '../components/HUD';
import { useGPS } from '../hooks/useGPS';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { speedKmh } from '../location/position';
import { IS_DEFAULT_PROVIDER, MUMBAI, createMapStyle, type MapTheme } from '../maps/style';

const vehicleImages = { vehicle: require('../../assets/vehicle.png') };
const initialViewState = { center: MUMBAI, zoom: 14.5, pitch: 48, bearing: -15 };

export default function CityScreen() {
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const smallScreen = height < 740 || fontScale > 1.3;
  const gps = useGPS();
  const reducedMotion = useReducedMotion();
  const camera = useRef<CameraRef>(null);
  const map = useRef<MapRef>(null);
  const firstFollow = useRef(true);
  const [theme, setTheme] = useState<MapTheme>('arcade');
  const [following, setFollowing] = useState(true);
  const [headingUp, setHeadingUp] = useState(true);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tileError, setTileError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [compact, setCompact] = useState(false);
  const mapStyle = useMemo(() => createMapStyle(theme), [theme]);
  const speed = speedKmh(gps.fix, gps.fresh);
  // Keep secondary controls quiet while moving, including when stale GPS last indicated motion.
  const moving = (gps.fix?.coords.speed ?? 0) > 2.2;
  const driving = compact || moving;
  const coordinates: [number, number] | null = gps.fix ? [gps.fix.coords.longitude, gps.fix.coords.latitude] : null;
  const latitude = coordinates?.[1];
  const longitude = coordinates?.[0];

  useEffect(() => {
    LogManager.onLog(({ message, level }) => {
      if ((level === 'error' || level === 'warn') && /tile|http|network|connection/i.test(message) && !/cancel/i.test(message)) setTileError(true);
      return false;
    });
    return () => LogManager.onLog(() => false);
  }, []);

  useEffect(() => {
    if (mapState !== 'loading') return;
    const timer = setTimeout(() => setMapState('error'), 20_000);
    return () => clearTimeout(timer);
  }, [attempt, mapState, theme]);

  useEffect(() => {
    if (!following || !gps.fresh || longitude === undefined || latitude === undefined || mapState !== 'ready') return;
    const options = { center: [longitude, latitude] as [number, number], bearing: headingUp ? gps.heading : 0, pitch: theme === 'arcade' ? 48 : 25, zoom: 16.6, duration: reducedMotion ? 0 : firstFollow.current ? 1200 : 800, padding: { top: 160 + insets.top, bottom: 190 + insets.bottom, left: 35, right: 35 } };
    if (firstFollow.current) camera.current?.flyTo(options);
    else camera.current?.easeTo(options);
    firstFollow.current = false;
  }, [longitude, latitude, gps.heading, gps.fresh, following, headingUp, mapState, reducedMotion, theme, insets.top, insets.bottom]);

  const retryMap = useCallback(() => { setTileError(false); setMapState('loading'); setAttempt(n => n + 1); }, []);
  const openSettings = () => { void Linking.openSettings().catch(() => Alert.alert('Open Settings', 'Open iPhone Settings → GameNav → Location to enable access.')); };
  const locate = () => {
    if (!gps.fresh) { if (gps.state === 'denied' && !gps.canAskAgain) openSettings(); else gps.retry(); return; }
    firstFollow.current = true;
    setFollowing(true);
    // Also recenter when already following.
    if (coordinates) camera.current?.flyTo({ center: coordinates, zoom: 16.6, pitch: theme === 'arcade' ? 48 : 25, bearing: headingUp ? gps.heading : 0, duration: reducedMotion ? 0 : 1000 });
  };
  const overview = () => {
    setFollowing(false);
    firstFollow.current = true;
    camera.current?.flyTo({ center: MUMBAI, zoom: 14.5, pitch: theme === 'arcade' ? 48 : 25, bearing: 0, duration: reducedMotion ? 0 : 1200 });
  };
  const changeTheme = async (value: MapTheme) => {
    if (value === theme) return;
    // Preserve the browsed viewport across the native style reload.
    try {
      const view = await map.current?.getViewState();
      setMapState('loading'); setTileError(false); setTheme(value);
      if (view) camera.current?.easeTo({ center: view.center, zoom: view.zoom, bearing: view.bearing, pitch: value === 'arcade' ? 48 : 25, duration: reducedMotion ? 0 : 700 });
    } catch { setTheme(value); setMapState('loading'); }
  };
  const gpsMessage = gps.state === 'denied' ? 'Location access is off' : gps.state === 'disabled' ? 'Location services are off' : gps.state === 'error' ? 'GPS connection interrupted' : gps.state === 'weak' ? 'Precise location needed' : gps.state === 'requesting' ? 'Requesting location access' : gps.state === 'paused' ? 'GPS paused' : 'Waiting for a GPS signal';
  const gpsNotice = !gps.fresh && <Notice title={gpsMessage} detail={smallScreen || driving ? undefined : gps.state === 'denied' ? 'Allow location in Settings to show your position.' : gps.state === 'weak' ? 'Enable Precise Location or move to an open area.' : 'Your live position and speed appear when GPS is available.'} action={gps.state === 'denied' || gps.state === 'disabled' || gps.state === 'weak' ? 'Location settings' : 'Retry GPS'} onPress={gps.state === 'denied' || gps.state === 'disabled' || gps.state === 'weak' ? openSettings : gps.retry} />;

  return <View style={s.screen}>
    <Map key={attempt} ref={map} style={StyleSheet.absoluteFill} mapStyle={mapStyle} tintColor={colors.cyan} attribution attributionPosition={{ bottom: insets.bottom + 12, right: 14 }} logo={false} compass={false}
      onDidFinishLoadingStyle={() => { setMapState('ready'); }}
      onDidFailLoadingMap={() => setMapState('error')}
      onDidFinishRenderingMapFully={() => setTileError(false)}
      onRegionWillChange={event => { if (event.nativeEvent.userInteraction) { setFollowing(false); firstFollow.current = true; } }}>
      <Camera ref={camera} initialViewState={initialViewState} minZoom={3} maxZoom={19} />
      <Images images={vehicleImages} />
      {coordinates && <LayerAnnotation id="vehicle-position" lngLat={coordinates} animated={!reducedMotion} animationDuration={800}>
        <Layer id="vehicle-halo" type="circle" paint={{ 'circle-radius': 26, 'circle-color': colors.cyan, 'circle-opacity': gps.fresh ? 0.13 : 0.04, 'circle-stroke-color': colors.cyan, 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.4 }} />
        <Layer id="vehicle" type="symbol" layout={{ 'icon-image': 'vehicle', 'icon-size': 0.55, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-rotate': gps.heading }} paint={{ 'icon-opacity': gps.fresh ? 1 : 0.35 }} />
      </LayerAnnotation>}
    </Map>

    <View pointerEvents="box-none" style={[s.top, { top: insets.top + 14, left: Math.max(insets.left, 18), right: Math.max(insets.right, 18) }]}>
      {(!smallScreen || gps.fresh || driving) && <View style={s.brandRow} pointerEvents="none"><View>{!smallScreen && <Text style={hud.eyebrow}>THE CITY IS YOURS</Text>}<Text style={hud.title}>GameNav<Text style={{ color: colors.cyan }}>.</Text></Text></View><View style={s.livePill}><View style={[s.dot, !gps.fresh && { backgroundColor: colors.amber }]} /><Text style={s.liveText}>{gps.fresh ? 'GPS LIVE' : 'CITY VIEW'}</Text></View></View>}
      {!driving && <>
        <Pressable accessibilityRole="button" accessibilityLabel="Destination search preview. Routing is not available." onPress={() => Alert.alert('Destination search preview', 'Search and turn-by-turn routes are not connected yet. You can explore the map and follow your real GPS position.')} style={({ pressed }) => [s.search, pressed && { opacity: 0.75 }]}>
          <View style={s.searchIcon}><View style={s.searchLens} /><View style={s.searchHandle} /></View><View style={{ flex: 1 }}><Text style={s.searchTitle}>Where to next?</Text><Text style={hud.muted}>Explore Mumbai</Text></View><Text style={s.preview}>PREVIEW</Text>
        </Pressable>
        <ThemeSwitcher theme={theme} onChange={value => { void changeTheme(value); }} disabled={mapState === 'loading'} />
      </>}
      {(mapState === 'loading' || mapState === 'error' || tileError) && <Notice title={mapState === 'loading' ? 'Loading city map…' : 'Map tiles unavailable'} detail={mapState === 'loading' ? 'Connecting to the vector map provider.' : 'Some streets may be missing. Check your connection and retry.'} loading={mapState === 'loading'} action={mapState !== 'loading' ? 'Retry map' : undefined} onPress={retryMap} />}
      {mapState === 'ready' && !tileError && gpsNotice}
    </View>

    <View pointerEvents="box-none" style={[s.bottom, { bottom: insets.bottom + 48, left: Math.max(insets.left, 18), right: Math.max(insets.right, 18) }]}>
      <View style={s.mapControls} pointerEvents="box-none">
        {!driving && <Pressable accessibilityRole="button" accessibilityLabel="Explore Mumbai city center" onPress={overview} style={s.cityChip}><Text style={s.cityText}>MUMBAI</Text><Text style={s.citySub}>CITY EXPLORER ↗</Text></Pressable>}
        <View style={s.controlStack}>
          <Control glyph={headingUp ? '↑' : 'N'} label={headingUp ? 'Heading up. Switch to north up' : 'North up. Switch to heading up'} active={headingUp} onPress={() => { setHeadingUp(value => !value); if (gps.fresh) setFollowing(true); }} />
          <Control glyph="◎" label={gps.fresh ? 'Recenter on my location' : 'Enable or retry GPS'} active={following && gps.fresh} onPress={locate} />
        </View>
      </View>
      <SpeedDisplay speed={speed}>
        <Text style={hud.eyebrow}>{following && gps.fresh ? headingUp ? 'HEADING UP' : 'NORTH UP' : 'FREE EXPLORE'}</Text>
        <Text style={hud.strong}>{gps.fresh ? 'You’re on the map' : 'Explore the city'}</Text>
        <Text style={hud.muted}>{gps.fresh ? `GPS ±${Math.round(gps.fix?.coords.accuracy ?? 0)} m · No active route` : 'Mumbai overview · No active route'}</Text>
      </SpeedDisplay>
      <View style={s.footerRow}><Text style={s.footerText}>{moving ? 'Keep your eyes on the road' : 'Live map. Your next adventure.'}</Text><Pressable accessibilityRole="button" accessibilityLabel={compact ? 'Show full interface' : 'Simplify interface for driving'} disabled={moving} onPress={() => setCompact(value => !value)} style={s.focusButton}><Text style={s.focusText}>{driving ? 'FOCUS ON' : 'FOCUS MODE'}</Text></Pressable></View>
    </View>
    <View style={[s.credits, { bottom: insets.bottom + 2 }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.creditsContent}>
        {IS_DEFAULT_PROVIDER ? [['OpenFreeMap', 'https://openfreemap.org'], ['© OpenMapTiles', 'https://openmaptiles.org'], ['© OpenStreetMap', 'https://www.openstreetmap.org/copyright']].map(([label, url]) => <Pressable key={label} accessibilityRole="link" onPress={() => { void Linking.openURL(url).catch(() => Alert.alert('Link unavailable', 'Please try again when you have a connection.')); }} style={s.creditLink}><Text style={s.creditText}>{label}</Text></Pressable>) : <Pressable accessibilityRole="button" onPress={() => { void map.current?.showAttribution().catch(() => Alert.alert('Attribution', 'Use the map’s information button to view provider credits.')); }} style={s.creditLink}><Text style={s.creditText}>Map attribution</Text></Pressable>}
      </ScrollView>
    </View>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07121d' },
  top: { position: 'absolute', gap: 12 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1620ed', padding: 13, borderRadius: 19 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1c303b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cyan },
  liveText: { color: colors.text, fontSize: 9, letterSpacing: 1.2, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 19, minHeight: 70, padding: 14 },
  searchTitle: { color: colors.text, fontWeight: '700', fontSize: 17, marginBottom: 3 },
  preview: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  searchIcon: { width: 24, height: 28 }, searchLens: { position: 'absolute', left: 1, top: 2, width: 17, height: 17, borderWidth: 2, borderRadius: 9, borderColor: colors.cyan }, searchHandle: { position: 'absolute', left: 17, top: 17, width: 2, height: 9, backgroundColor: colors.cyan, transform: [{ rotate: '-45deg' }] },
  bottom: { position: 'absolute', gap: 10 },
  mapControls: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 9 },
  controlStack: { flexDirection: 'row', gap: 10, marginLeft: 'auto' },
  cityChip: { backgroundColor: '#101c27ed', borderColor: colors.border, borderWidth: 1, borderRadius: 13, padding: 12, minHeight: 50 },
  cityText: { color: colors.text, fontWeight: '800', fontSize: 12, letterSpacing: 3 },
  citySub: { color: colors.cyan, fontSize: 8, letterSpacing: 1.2, marginTop: 5 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0b1620ed', borderRadius: 12, paddingLeft: 10 },
  footerText: { color: colors.muted, fontSize: 10, flex: 1 },
  focusButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  focusText: { color: colors.cyan, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  credits: { position: 'absolute', left: 10, right: 46, height: 44, backgroundColor: '#0b1620e8', borderRadius: 9 },
  creditsContent: { alignItems: 'center', paddingHorizontal: 4 },
  creditLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 5 },
  creditText: { color: '#bfced8', fontSize: 9 },
});
