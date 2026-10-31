import { Camera, GeoJSONSource, Images, Layer, LayerAnnotation, LogManager, Map, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Control, Notice, SpeedDisplay, ThemeSwitcher, colors, hud } from '../components/HUD';
import { DestinationCard } from '../components/DestinationCard';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useGPSState } from '../location/GPSProvider';
import { isUsableFix, speedKmh } from '../location/position';
import { distanceBetween } from '../routing/routes';
import { useDrivingRoute } from '../routing/useDrivingRoute';
import { IS_DEFAULT_PROVIDER, MUMBAI, createMapStyle, type MapTheme } from '../maps/style';
import { useDestination } from '../search/DestinationProvider';

const vehicleImages = { vehicle: require('../../assets/vehicle.png'), direction: require('../../assets/direction-arrow.png'), destination: require('../../assets/destination-pin.png') };
const initialViewState = { center: MUMBAI, zoom: 14.8, pitch: 0, bearing: 0 };

export default function CityScreen() {
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const smallScreen = height < 740 || fontScale > 1.3;
  const gps = useGPSState();
  const { destination, revision: destinationRevision, clear: clearDestination } = useDestination();
  const { state: routing, calculate: calculateRoute, clear: clearRoute } = useDrivingRoute(destinationRevision);
  const route = routing.route;
  const routeGeometry = useMemo(() => route ? { type: 'Feature' as const, properties: {}, geometry: route.geometry } : null, [route]);
  const viewedRoute = useRef<typeof route>(null);
  const viewedDestinationRevision = useRef(0);
  const reducedMotion = useReducedMotion();
  const camera = useRef<CameraRef>(null);
  const map = useRef<MapRef>(null);
  const firstFollow = useRef(true);
  const [theme, setTheme] = useState<MapTheme>('arcade');
  const [following, setFollowing] = useState(true);
  const [headingUp, setHeadingUp] = useState(false);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tileError, setTileError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [compact, setCompact] = useState(true);
  const [showBuildings, setShowBuildings] = useState(false);
  const pitch = showBuildings ? 48 : 0;
  const followZoom = showBuildings ? 16.6 : 15.3;
  const mapStyle = useMemo(() => createMapStyle(theme, showBuildings), [theme, showBuildings]);
  const speed = speedKmh(gps.fix, gps.fresh);
  // Keep secondary controls quiet while moving, including when stale GPS last indicated motion.
  const moving = (gps.fix?.coords.speed ?? 0) > 2.2;
  const driving = compact || moving;
  const cleanMap = compact && !moving;
  const coordinates: [number, number] | null = gps.fix ? [gps.fix.coords.longitude, gps.fix.coords.latitude] : null;
  const latitude = coordinates?.[1];
  const longitude = coordinates?.[0];
  const startChanged = !!route && !!coordinates && gps.fresh && distanceBetween(route.origin, coordinates) > 150;
  const canRoute = !moving && gps.fresh && !!gps.fix && isUsableFix(gps.fix);

  const getRoute = () => {
    if (!destination || !canRoute || !gps.fix || !isUsableFix(gps.fix)) return;
    viewedRoute.current = null;
    void calculateRoute([gps.fix.coords.longitude, gps.fix.coords.latitude], destination.coordinates);
  };
  const viewRoute = useCallback(() => {
    if (!route || mapState !== 'ready') return;
    setFollowing(false); setCompact(true); firstFollow.current = true;
    camera.current?.fitBounds(route.bounds, { bearing: 0, pitch: 0, duration: reducedMotion ? 0 : 1000, padding: { top: insets.top + 75, bottom: Math.min(height * 0.55, insets.bottom + 430), left: 40, right: 40 } });
    setShowBuildings(false);
  }, [route, mapState, reducedMotion, insets.top, insets.bottom, height]);
  useEffect(() => {
    if (route && route !== viewedRoute.current && mapState === 'ready' && !moving) { viewedRoute.current = route; viewRoute(); }
  }, [route, mapState, moving, viewRoute]);

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
    const options = { center: [longitude, latitude] as [number, number], bearing: headingUp ? gps.heading : 0, pitch, zoom: followZoom, duration: reducedMotion ? 0 : firstFollow.current ? 1200 : 800, padding: { top: (cleanMap ? 30 : 130) + insets.top, bottom: (cleanMap ? 90 : 170) + insets.bottom, left: 35, right: 35 } };
    if (firstFollow.current) camera.current?.flyTo(options);
    else camera.current?.easeTo(options);
    firstFollow.current = false;
  }, [longitude, latitude, gps.heading, gps.fresh, following, headingUp, mapState, reducedMotion, pitch, followZoom, cleanMap, insets.top, insets.bottom]);

  const retryMap = useCallback(() => { setTileError(false); setMapState('loading'); setAttempt(n => n + 1); }, []);
  const openSettings = () => { void Linking.openSettings().catch(() => Alert.alert('Open Settings', 'Open iPhone Settings → GameNav → Location to enable access.')); };
  const locate = () => {
    if (!gps.fresh) { if (gps.state === 'denied' && !gps.canAskAgain) openSettings(); else gps.retry(); return; }
    firstFollow.current = true;
    setFollowing(true);
    // Also recenter when already following.
    if (coordinates) camera.current?.flyTo({ center: coordinates, zoom: followZoom, pitch, bearing: headingUp ? gps.heading : 0, duration: reducedMotion ? 0 : 1000 });
  };
  const overview = () => {
    setFollowing(false);
    firstFollow.current = true;
    camera.current?.flyTo({ center: MUMBAI, zoom: 14.8, pitch, bearing: 0, duration: reducedMotion ? 0 : 1200 });
  };
  const changeTheme = async (value: MapTheme) => {
    if (value === theme) return;
    // Preserve the browsed viewport across the native style reload.
    try {
      const view = await map.current?.getViewState();
      setMapState('loading'); setTileError(false); setTheme(value);
      if (view) camera.current?.easeTo({ center: view.center, zoom: view.zoom, bearing: view.bearing, pitch, duration: reducedMotion ? 0 : 700 });
    } catch { setTheme(value); setMapState('loading'); }
  };
  const toggleBuildings = async () => {
    try {
      const view = await map.current?.getViewState();
      setShowBuildings(value => !value);
      if (view) camera.current?.easeTo({ center: view.center, zoom: showBuildings ? view.zoom : Math.max(15.5, view.zoom), bearing: view.bearing, pitch: showBuildings ? 0 : 48, duration: reducedMotion ? 0 : 700 });
    } catch { setShowBuildings(value => !value); }
  };
  const openSearch = () => { if (!moving) router.navigate('/search'); };
  const viewDestination = useCallback(() => {
    if (!destination || mapState !== 'ready') return;
    setFollowing(false);
    setCompact(true);
    firstFollow.current = true;
    camera.current?.flyTo({
      center: destination.coordinates, zoom: destination.zoom, bearing: 0, pitch,
      duration: reducedMotion ? 0 : 1000,
      padding: { top: insets.top + 72, bottom: insets.bottom + 320, left: 36, right: 36 },
    });
  }, [destination, mapState, pitch, reducedMotion, insets.top, insets.bottom]);

  useFocusEffect(useCallback(() => {
    if (!destination || mapState !== 'ready' || viewedDestinationRevision.current === destinationRevision) return;
    viewedDestinationRevision.current = destinationRevision;
    viewDestination();
  }, [destination, destinationRevision, mapState, viewDestination]));
  const gpsMessage = gps.state === 'denied' ? 'Location access is off' : gps.state === 'disabled' ? 'Location services are off' : gps.state === 'error' ? 'GPS connection interrupted' : gps.state === 'weak' ? 'Precise location needed' : gps.state === 'requesting' ? 'Requesting location access' : gps.state === 'paused' ? 'GPS paused' : 'Waiting for a GPS signal';
  const gpsNotice = !gps.fresh && <Notice title={gpsMessage} detail={smallScreen || driving ? undefined : gps.state === 'denied' ? 'Allow location in Settings to show your position.' : gps.state === 'weak' ? 'Enable Precise Location or move to an open area.' : 'Your live position and speed appear when GPS is available.'} action={gps.state === 'denied' || gps.state === 'disabled' || gps.state === 'weak' ? 'Location settings' : 'Retry GPS'} onPress={gps.state === 'denied' || gps.state === 'disabled' || gps.state === 'weak' ? openSettings : gps.retry} />;

  return <View style={s.screen}>
    <Map key={attempt} ref={map} style={StyleSheet.absoluteFill} mapStyle={mapStyle} tintColor={colors.accent} attribution attributionPosition={{ bottom: insets.bottom + 12, right: 14 }} logo={false} compass={false} touchPitch={showBuildings}
      onDidFinishLoadingStyle={() => { setMapState('ready'); }}
      onDidFailLoadingMap={() => setMapState('error')}
      onDidFinishRenderingMapFully={() => setTileError(false)}
      onRegionWillChange={event => { if (event.nativeEvent.userInteraction) { setFollowing(false); firstFollow.current = true; } }}>
      <Camera ref={camera} initialViewState={initialViewState} minZoom={3} maxZoom={19} />
      <Images images={vehicleImages} />
      {routeGeometry && <GeoJSONSource id="driving-route" data={routeGeometry}>
        <Layer id="route-outline" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#21142e', 'line-width': 10, 'line-opacity': 0.95 }} />
        <Layer id="route-purple" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#ad4cff', 'line-width': 6 }} />
      </GeoJSONSource>}
      {route && <LayerAnnotation id="route-start" lngLat={route.start}><Layer id="route-start-dot" type="circle" paint={{ 'circle-color': '#f5f5f5', 'circle-radius': 5, 'circle-stroke-color': '#ad4cff', 'circle-stroke-width': 3 }} /></LayerAnnotation>}
      {route && <LayerAnnotation id="route-road-end" lngLat={route.end}><Layer id="route-end-dot" type="circle" paint={{ 'circle-color': '#ad4cff', 'circle-radius': 5, 'circle-stroke-color': '#f5f5f5', 'circle-stroke-width': 2 }} /></LayerAnnotation>}
      {coordinates && <LayerAnnotation id="vehicle-position" lngLat={coordinates} animated={!reducedMotion} animationDuration={800}>
        <Layer id="vehicle-halo" type="circle" paint={{ 'circle-radius': theme === 'arcade' ? 19 : 26, 'circle-color': '#111610', 'circle-opacity': gps.fresh ? 0.22 : 0.08 }} />
        <Layer id="vehicle" type="symbol" layout={{ 'icon-image': theme === 'arcade' ? 'direction' : 'vehicle', 'icon-size': theme === 'arcade' ? 0.46 : 0.55, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'viewport', 'icon-rotate': gps.heading }} paint={{ 'icon-opacity': gps.fresh ? 1 : 0.35 }} />
      </LayerAnnotation>}
      {destination && <LayerAnnotation id="destination-position" lngLat={destination.coordinates}>
        <Layer id="destination-target" type="circle" paint={{ 'circle-color': '#9b4dff', 'circle-radius': 5, 'circle-stroke-color': '#f1f1f1', 'circle-stroke-width': 1 }} />
        <Layer id="destination-pin" type="symbol" layout={{ 'icon-image': 'destination', 'icon-size': 0.5, 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport' }} />
        <Layer id="destination-label" type="symbol" layout={{ 'text-field': ['literal', destination.name], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.6], 'text-max-width': 14 }} paint={{ 'text-color': '#f1f1f1', 'text-halo-color': '#131313', 'text-halo-width': 2 }} />
      </LayerAnnotation>}
    </Map>

    <View pointerEvents="box-none" style={[s.top, { top: insets.top + 14, left: Math.max(insets.left, 18), right: Math.max(insets.right, 18) }]}>
      {!cleanMap && (!smallScreen || gps.fresh || driving) && <View style={s.brandRow} pointerEvents="none"><Text maxFontSizeMultiplier={1.3} style={hud.title}>GAMENAV</Text><View style={s.livePill}><View style={[s.dot, !gps.fresh && { backgroundColor: colors.amber }]} /><Text style={s.liveText}>{gps.fresh ? 'GPS LIVE' : 'CITY MAP'}</Text></View></View>}
      {cleanMap && <Pressable accessibilityRole="button" accessibilityLabel="Search for a destination" onPress={openSearch} style={({ pressed }) => [s.quickSearch, pressed && { opacity: 0.65 }]}><Text style={s.quickSearchGlyph}>⌕</Text><Text style={s.quickSearchText}>SEARCH</Text></Pressable>}
      {!driving && <>
        <Pressable accessibilityRole="button" accessibilityLabel={destination ? 'Change selected destination' : 'Search for a destination'} onPress={openSearch} style={({ pressed }) => [s.search, pressed && { opacity: 0.75 }]}>
          <View style={s.searchIcon}><View style={s.searchLens} /><View style={s.searchHandle} /></View><Text numberOfLines={1} style={s.searchTitle}>{destination ? destination.name : 'Find a destination'}</Text><Text style={s.preview}>SEARCH</Text>
        </Pressable>
        <ThemeSwitcher theme={theme} onChange={value => { void changeTheme(value); }} disabled={mapState === 'loading'} />
      </>}
      {(mapState === 'loading' || mapState === 'error' || tileError) && <Notice title={mapState === 'loading' ? 'Loading city map…' : 'Map tiles unavailable'} detail={mapState === 'loading' ? 'Connecting to the vector map provider.' : 'Some streets may be missing. Check your connection and retry.'} loading={mapState === 'loading'} action={mapState !== 'loading' ? 'Retry map' : undefined} onPress={retryMap} />}
      {mapState === 'ready' && !tileError && gpsNotice}
    </View>

    <View pointerEvents="box-none" style={[s.bottom, { bottom: insets.bottom + 48, left: Math.max(insets.left, 18), right: Math.max(insets.right, 18) }]}>
      {destination && <DestinationCard place={destination} moving={moving} onView={route ? viewRoute : viewDestination} onChange={openSearch} onClear={clearDestination} routing={routing} canRoute={canRoute} startChanged={startChanged} onRoute={getRoute} onCancel={clearRoute} />}
      <View style={s.mapControls} pointerEvents="box-none">
        {!moving && <Pressable accessibilityRole="button" accessibilityLabel="Explore Mumbai city center" onPress={overview} style={s.cityChip}><Text style={s.cityText}>MUMBAI</Text><Text style={s.citySub}>CITY MAP ↗</Text></Pressable>}
        <View style={s.controlStack}>
          {!moving && <Control glyph={showBuildings ? '2D' : '3D'} label={showBuildings ? 'Switch to flat 2D map' : 'Show 3D buildings and tilted map'} active={showBuildings} onPress={() => { void toggleBuildings(); }} />}
          <Control glyph={headingUp ? '↑' : 'N'} label={headingUp ? 'Heading up. Switch to north up' : 'North up. Switch to heading up'} active={headingUp} onPress={() => { setHeadingUp(value => !value); if (gps.fresh) setFollowing(true); }} />
          <Control glyph="◎" label={gps.fresh ? 'Recenter on my location' : 'Enable or retry GPS'} active={following && gps.fresh} onPress={locate} />
        </View>
      </View>
      {!cleanMap && (!destination || moving) && <SpeedDisplay speed={speed}>
        <Text style={hud.eyebrow}>{following && gps.fresh ? headingUp ? 'HEADING UP' : 'NORTH UP' : 'FREE EXPLORE'}</Text>
        <Text style={hud.strong}>{gps.fresh ? 'GPS TRACKING' : 'CITY OVERVIEW'}</Text>
        <Text style={hud.muted}>{gps.fresh ? `GPS ±${Math.round(gps.fix?.coords.accuracy ?? 0)} m · ${route ? 'Route preview only' : 'No active route'}` : `GPS unavailable · ${route ? 'Saved route preview' : 'No active route'}`}</Text>
      </SpeedDisplay>}
      <View style={s.footerRow}><Text style={s.footerText}>{moving ? 'Keep your eyes on the road' : `${showBuildings ? '3D VIEW' : '2D MAP'} · ${gps.fresh ? 'GPS LIVE' : 'GPS UNAVAILABLE'}`}</Text><Pressable accessibilityRole="button" accessibilityLabel={compact ? 'Show destination search, themes, and speed panel' : 'Expand map and hide panels'} disabled={moving} onPress={() => setCompact(value => !value)} style={s.focusButton}><Text style={s.focusText}>{moving ? 'FOCUS ON' : compact ? 'SHOW HUD' : 'FULL MAP'}</Text></Pressable></View>
    </View>
    <View style={[s.credits, { bottom: insets.bottom + 2 }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.creditsContent}>
        {IS_DEFAULT_PROVIDER ? [['OpenFreeMap', 'https://openfreemap.org'], ['© OpenMapTiles', 'https://openmaptiles.org'], ['© OpenStreetMap', 'https://www.openstreetmap.org/copyright']].map(([label, url]) => <Pressable key={label} accessibilityRole="link" onPress={() => { void Linking.openURL(url).catch(() => Alert.alert('Link unavailable', 'Please try again when you have a connection.')); }} style={s.creditLink}><Text style={s.creditText}>{label}</Text></Pressable>) : <Pressable accessibilityRole="button" onPress={() => { void map.current?.showAttribution().catch(() => Alert.alert('Attribution', 'Use the map’s information button to view provider credits.')); }} style={s.creditLink}><Text style={s.creditText}>Map attribution</Text></Pressable>}
      </ScrollView>
    </View>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#191c1a' },
  top: { position: 'absolute', gap: 8 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#10140fe8', padding: 10, borderRadius: 2, borderBottomColor: '#e2e6d8', borderBottomWidth: 2 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#20261c', borderRadius: 1, paddingHorizontal: 10, paddingVertical: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gps },
  liveText: { color: colors.text, fontSize: 9, letterSpacing: 1.2, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 2, minHeight: 52, padding: 12 },
  quickSearch: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  quickSearchGlyph: { color: colors.accent, fontSize: 25 },
  quickSearchText: { color: colors.text, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  searchTitle: { color: colors.text, fontWeight: '600', fontSize: 14, flex: 1 },
  preview: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  searchIcon: { width: 24, height: 28 }, searchLens: { position: 'absolute', left: 1, top: 2, width: 17, height: 17, borderWidth: 2, borderRadius: 9, borderColor: colors.accent }, searchHandle: { position: 'absolute', left: 17, top: 17, width: 2, height: 9, backgroundColor: colors.accent, transform: [{ rotate: '-45deg' }] },
  bottom: { position: 'absolute', gap: 10 },
  mapControls: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 9 },
  controlStack: { flexDirection: 'row', gap: 10, marginLeft: 'auto' },
  cityChip: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 2, padding: 12, minHeight: 50 },
  cityText: { color: colors.text, fontWeight: '800', fontSize: 12, letterSpacing: 3 },
  citySub: { color: colors.accent, fontSize: 8, letterSpacing: 1.2, marginTop: 5 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.panel, borderRadius: 2, paddingLeft: 10 },
  footerText: { color: colors.muted, fontSize: 10, flex: 1 },
  focusButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  focusText: { color: colors.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  credits: { position: 'absolute', left: 10, right: 46, height: 44, backgroundColor: '#10140fe8', borderRadius: 1 },
  creditsContent: { alignItems: 'center', paddingHorizontal: 4 },
  creditLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 5 },
  creditText: { color: '#c5ccbd', fontSize: 9 },
});
