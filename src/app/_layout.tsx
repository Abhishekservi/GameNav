import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { GPSProvider } from '../location/GPSProvider';
import { DestinationProvider } from '../search/DestinationProvider';
import { SavedPlacesProvider } from '../saved/SavedPlacesProvider';

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  const reducedMotion = useReducedMotion();
  return <GPSProvider><DestinationProvider><SavedPlacesProvider>
    <StatusBar style="light" />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#131313' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="search" options={{ presentation: 'fullScreenModal', animation: reducedMotion ? 'none' : 'slide_from_bottom' }} />
    </Stack>
  </SavedPlacesProvider></DestinationProvider></GPSProvider>;
}
