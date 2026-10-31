import { Camera, GeoJSONSource, Images, Layer, LayerAnnotation, LogManager, Map, type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Control, Notice, ThemeSwitcher, colors } from '../components/HUD';
import { DestinationCard } from '../components/DestinationCard';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useGPSState } from '../location/GPSProvider';
import { isUsableFix, speedKmh } from '../location/position';
import { distanceBetween, ROUTING_CREDIT, ROUTING_CREDIT_URL } from '../routing/routes';
import { useDrivingRoute } from '../routing/useDrivingRoute';
import { IS_DEFAULT_PROVIDER, MUMBAI, createMapStyle, type MapTheme } from '../maps/style';
import { useDestination } from '../search/DestinationProvider';

const vehicleImages = { vehicle: require('../../assets/vehicle.png'), direction: require('../../assets/direction-arrow.png'), destination: require('../../assets/destination-pin.png') };
const initialViewState = { center: MUMBAI, zoom: 14.8, pitch: 0, bearing: 0 };
const showMapCredits = process.env.EXPO_PUBLIC_PERSONAL_BUILD !== '1';
const creditInset = showMapCredits ? 44 : 8;

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
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const [overviewMode, setOverviewMode] = useState(false);
  const [showBuildings, setShowBuildings] = useState(false);
  const pitch = showBuildings ? 48 : 0;
  const followZoom = showBuildings ? 16.6 : 15.3;
  const mapStyle = useMemo(() => createMapStyle(theme, showBuildings), [theme, showBuildings]);
  const speed = speedKmh(gps.fix, gps.fresh);
  // Keep secondary controls quiet while moving, including when stale GPS last indicated motion.
  const moving = (gps.fix?.coords.speed ?? 0) > 2.2;
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
    setFollowing(false); setOverviewMode(true); firstFollow.current = true;
    camera.current?.fitBounds(route.bounds, { bearing: 0, pitch: 0, duration: reducedMotion ? 0 : 1000, padding: { top: insets.top + 75, bottom: Math.min(height * 0.65, insets.bottom + panelHeight + creditInset + 24), left: 32, right: 82 } });
    setShowBuildings(false);
  }, [route, mapState, reducedMotion, insets.top, insets.bottom, height, panelHeight]);
  useEffect(() => {
    if (route && (route !== viewedRoute.current || (overviewMode && !following)) && mapState === 'ready' && !moving) { viewedRoute.current = route; viewRoute(); }
  }, [route, mapState, moving, viewRoute, overviewMode, following]);

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
    const options = { center: [longitude, latitude] as [number, number], bearing: headingUp ? gps.heading : 0, pitch, zoom: followZoom, duration: reducedMotion ? 0 : firstFollow.current ? 1200 : 800, padding: { top: (moving ? 24 : 88) + insets.top, bottom: panelHeight + 80 + insets.bottom, left: 35, right: 35 } };
    if (firstFollow.current) camera.current?.flyTo(options);
    else camera.current?.easeTo(options);
    firstFollow.current = false;
  }, [longitude, latitude, gps.heading, gps.fresh, following, headingUp, mapState, reducedMotion, pitch, followZoom, moving, panelHeight, insets.top, insets.bottom]);

  const retryMap = useCallback(() => { setTileError(false); setMapState('loading'); setAttempt(n => n + 1); }, []);
  const openSettings = () => { void Linking.openSettings().catch(() => Alert.alert('Open Settings', 'Open iPhone Settings → GameNav → Location to enable access.')); };
  const locate = () => {
    setOverviewMode(false); setOptionsOpen(false);
    if (!gps.fresh) { if (gps.state === 'denied' && !gps.canAskAgain) openSettings(); else gps.retry(); return; }
    firstFollow.current = true;
    setFollowing(true);
    // Also recenter when already following.
    if (coordinates) camera.current?.flyTo({ center: coordinates, zoom: followZoom, pitch, bearing: headingUp ? gps.heading : 0, duration: reducedMotion ? 0 : 1000 });
  };
  const overview = () => {
    setOverviewMode(false); setOptionsOpen(false);
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
    setOverviewMode(false);
    try {
      const view = await map.current?.getViewState();
      setShowBuildings(value => !value);
      if (view) camera.current?.easeTo({ center: view.center, zoom: showBuildings ? view.zoom : Math.max(15.5, view.zoom), bearing: view.bearing, pitch: showBuildings ? 0 : 48, duration: reducedMotion ? 0 : 700 });
    } catch { setShowBuildings(value => !value); }
  };
  const openSearch = () => { if (!moving) { setOptionsOpen(false); router.navigate('/search'); } };
  const viewDestination = useCallback(() => {
    if (!destination || mapState !== 'ready') return;
    setFollowing(false);
    setOverviewMode(false); setOptionsOpen(false);
    firstFollow.current = true;
    camera.current?.flyTo({
      center: destination.coordinates, zoom: destination.zoom, bearing: 0, pitch,
      duration: reducedMotion ? 0 : 1000,
      padding: { top: insets.top + 72, bottom: insets.bottom + panelHeight + creditInset + 24, left: 36, right: 36 },
    });
  }, [destination, mapState, pitch, reducedMotion, insets.top, insets.bottom, panelHeight]);

  useFocusEffect(useCallback(() => {
    if (!destination || mapState !== 'ready' || viewedDestinationRevision.current === destinationRevision) return;
    viewedDestinationRevision.current = destinationRevision;
    viewDestination();
  }, [destination, destinationRevision, mapState, viewDestination]));
  const gpsMessage = gps.state === 'denied' ? 'Location access is off' : gps.state === 'disabled' ? 'Location services are off' : gps.state === 'error' ? 'GPS connection interrupted' : gps.state === 'weak' ? 'Precise location needed' : gps.state === 'requesting' ? 'Requesting location access' : gps.state === 'paused' ? 'GPS paused' : 'Waiting for a GPS signal';
  const gpsNotice = !gps.fresh && <Notice title={gpsMessage} detail={smallScreen || moving ? undefined : gps.state === 'denied' ? 'Allow location in Settings to show your position.' : gps.state === 'weak' ? 'Enable Precise Location or move to an open area.' : 'Your live position and speed appear when GPS is available.'} action={gps.state === 'denied' || gps.state === 'disabled' || gps.state === 'weak' ? 'Location settings' : 'Retry GPS'} onPress={gps.state === 'denied' || gps.state === 'disabled' || gps.state === 'weak' ? openSettings : gps.retry} />;

  return <View style={s.screen}>
    <Map key={attempt} ref={map} style={StyleSheet.absoluteFill} mapStyle={mapStyle} tintColor={colors.accent} attribution={showMapCredits} attributionPosition={{ bottom: insets.bottom + 12, right: 14 }} logo={false} compass={false} touchPitch={showBuildings}
      onDidFinishLoadingStyle={() => { setMapState('ready'); }}
      onDidFailLoadingMap={() => setMapState('error')}
      onDidFinishRenderingMapFully={() => setTileError(false)}
      onRegionWillChange={event => { if (event.nativeEvent.userInteraction) { setOverviewMode(false); setFollowing(false); firstFollow.current = true; } }}>
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

    <View pointerEvents="box-none" style={[s.top, { top: insets.top + 10, left: Math.max(insets.left, 16), right: Math.max(insets.right, 16) }]}>
      {!moving && <Pressable accessibilityRole="button" accessibilityLabel="Search places or addresses" onPress={openSearch} style={({ pressed }) => [s.search, pressed && { opacity: 0.8 }]}>
        <View style={s.searchIcon}><View style={s.searchLens} /><View style={s.searchHandle} /></View><Text style={s.searchTitle}>Search places or addresses</Text>
      </Pressable>}
      {(mapState === 'loading' || mapState === 'error' || tileError) && <Notice title={mapState === 'loading' ? 'Loading map…' : 'Map tiles unavailable'} detail={mapState === 'loading' ? undefined : 'Check your connection and retry.'} loading={mapState === 'loading'} action={mapState !== 'loading' ? 'Retry' : undefined} onPress={retryMap} />}
      {mapState === 'ready' && !tileError && gpsNotice}
    </View>

    <View pointerEvents="box-none" style={[s.floating, { right: Math.max(insets.right, 16), bottom: insets.bottom + panelHeight + creditInset + 14 }]}>
      {!moving && <Control glyph="▱" label={optionsOpen ? 'Close map options' : 'Map options: theme, buildings, and orientation'} active={optionsOpen} onPress={() => { setOverviewMode(false); setOptionsOpen(value => !value); }} />}
      <Control glyph="◎" label={gps.fresh ? 'Recenter on my location' : 'Enable or retry GPS'} active={following && gps.fresh} onPress={locate} />
    </View>
    {moving && <View style={[s.speedBadge, { bottom: insets.bottom + panelHeight + creditInset + 14, left: Math.max(insets.left, 16) }]}><Text style={s.speed}>{speed === null ? '—' : speed}</Text><Text style={s.speedUnit}>km/h</Text></View>}
    <View pointerEvents="box-none" onLayout={event => { const next = Math.ceil(event.nativeEvent.layout.height); setPanelHeight(current => Math.abs(current - next) > 1 ? next : current); }} style={[s.bottom, { bottom: insets.bottom + creditInset, left: Math.max(insets.left, 12), right: Math.max(insets.right, 12) }]}>
      {optionsOpen && !moving ? <View style={s.options}>
        <View style={s.optionsHeader}><Text style={s.optionsTitle}>Map options</Text><Pressable accessibilityRole="button" accessibilityLabel="Close map options" onPress={() => setOptionsOpen(false)} style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>
        <ThemeSwitcher theme={theme} onChange={value => { void changeTheme(value); }} disabled={mapState === 'loading'} />
        <Pressable accessibilityRole="button" onPress={() => { void toggleBuildings(); }} style={s.optionRow}><Text style={s.optionLabel}>Buildings</Text><Text style={s.optionValue}>{showBuildings ? '3D' : 'Flat'} ›</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setHeadingUp(value => !value); if (gps.fresh) setFollowing(true); }} style={s.optionRow}><Text style={s.optionLabel}>Orientation</Text><Text style={s.optionValue}>{headingUp ? 'Heading up' : 'North up'} ›</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={overview} style={s.optionRow}><Text style={s.optionLabel}>Explore Mumbai</Text><Text style={s.optionValue}>↗</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { void map.current?.showAttribution().catch(() => Alert.alert('Map data', 'OpenFreeMap, OpenMapTiles and OpenStreetMap. Licence details are in the project documentation.')); }} style={s.optionRow}><Text style={s.optionLabel}>About map data</Text><Text style={s.optionValue}>ⓘ</Text></Pressable>
      </View> : destination ? <DestinationCard key={destinationRevision} place={destination} moving={moving} onView={route ? viewRoute : viewDestination} onChange={openSearch} onClear={clearDestination} routing={routing} canRoute={canRoute} startChanged={startChanged} onRoute={getRoute} onCancel={clearRoute} /> : null}
    </View>
    {showMapCredits && <View style={[s.credits, { bottom: insets.bottom + 2 }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.creditsContent}>
        {IS_DEFAULT_PROVIDER ? [['OpenFreeMap', 'https://openfreemap.org'], ['© OpenMapTiles', 'https://openmaptiles.org'], ['© OpenStreetMap', 'https://www.openstreetmap.org/copyright']].map(([label, url]) => <Pressable key={label} accessibilityRole="link" onPress={() => { void Linking.openURL(url).catch(() => Alert.alert('Link unavailable', 'Please try again when you have a connection.')); }} style={s.creditLink}><Text style={s.creditText}>{label}</Text></Pressable>) : <Pressable accessibilityRole="button" onPress={() => { void map.current?.showAttribution().catch(() => Alert.alert('Attribution', 'Use the map’s information button to view provider credits.')); }} style={s.creditLink}><Text style={s.creditText}>Map attribution</Text></Pressable>}
        {route && <Pressable accessibilityRole="link" accessibilityLabel={`Routes by ${ROUTING_CREDIT}`} onPress={() => { void Linking.openURL(ROUTING_CREDIT_URL).catch(() => Alert.alert('Link unavailable', 'Please try again when you have a connection.')); }} style={s.creditLink}><Text style={s.creditText}>{ROUTING_CREDIT}</Text></Pressable>}
      </ScrollView>
    </View>}
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#191c1a' },
  top: { position: 'absolute', gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 18, backgroundColor: '#202126', borderRadius: 28, borderWidth: 1, borderColor: '#3b3c43', boxShadow: '0px 3px 14px rgba(0, 0, 0, 0.2)' },
  searchTitle: { color: '#ceced5', fontSize: 16, flex: 1 },
  searchIcon: { width: 22, height: 24 },
  searchLens: { position: 'absolute', left: 1, top: 2, width: 15, height: 15, borderWidth: 2, borderRadius: 8, borderColor: '#bfc0c7' },
  searchHandle: { position: 'absolute', left: 16, top: 15, width: 2, height: 8, backgroundColor: '#bfc0c7', transform: [{ rotate: '-45deg' }] },
  bottom: { position: 'absolute' },
  floating: { position: 'absolute', gap: 10 },
  options: { borderRadius: 24, paddingHorizontal: 16, paddingBottom: 8, paddingTop: 8, backgroundColor: '#202126', borderWidth: 1, borderColor: '#3b3c43' },
  optionsHeader: { flexDirection: 'row', alignItems: 'center' },
  optionsTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#bfc0c7', fontSize: 25 },
  optionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  optionLabel: { color: '#e9e9ed', fontSize: 14 },
  optionValue: { color: '#bfc0c7', fontSize: 14 },
  speedBadge: { position: 'absolute', width: 64, minHeight: 64, borderRadius: 20, backgroundColor: '#202126', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3b3c43' },
  speed: { color: colors.text, fontSize: 25, fontWeight: '700', fontVariant: ['tabular-nums'] },
  speedUnit: { color: '#bfc0c7', fontSize: 10 },
  credits: { position: 'absolute', left: 8, right: 8 },
  creditsContent: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 8, backgroundColor: '#191b20df', borderRadius: 18 },
  creditLink: { minHeight: 44, justifyContent: 'center' },
  creditText: { color: '#bfc0c7', fontSize: 10 },
});
