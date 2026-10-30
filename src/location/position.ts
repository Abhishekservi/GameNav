import type { LocationObject } from 'expo-location';

export const FIX_MAX_AGE_MS = 12_000;
export function isUsableFix(fix: LocationObject, now = Date.now()): boolean {
  const { longitude, latitude, accuracy } = fix.coords;
  return Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90 && Number.isFinite(fix.timestamp) && now - fix.timestamp <= FIX_MAX_AGE_MS && fix.timestamp <= now + 2000 && accuracy !== null && accuracy >= 0 && accuracy <= 100;
}
export function speedKmh(fix: LocationObject | null, fresh: boolean): number | null {
  const speed = fix?.coords.speed;
  return fresh && speed !== null && speed !== undefined && Number.isFinite(speed) && speed >= 0 ? Math.round(speed * 3.6) : null;
}
export function shortestAngle(from: number, to: number): number {
  return from + (((to - from) % 360 + 540) % 360) - 180;
}
