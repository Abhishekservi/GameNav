import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';

export type MapTheme = 'classic' | 'arcade';
export const MUMBAI: [number, number] = [72.8311, 18.9435];

// OpenMapTiles-compatible TileJSON, not a demonstration tile service.
export const TILEJSON_URL = process.env.EXPO_PUBLIC_MAP_TILEJSON_URL || 'https://tiles.openfreemap.org/planet';
export const IS_DEFAULT_PROVIDER = TILEJSON_URL === 'https://tiles.openfreemap.org/planet';
export const GLYPHS_URL = process.env.EXPO_PUBLIC_MAP_GLYPHS_URL || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const MAP_ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_ATTRIBUTION || (IS_DEFAULT_PROVIDER ? '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://openmaptiles.org">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' : undefined);

export function createMapStyle(theme: MapTheme): StyleSpecification {
  const arcade = theme === 'arcade';
  const p = arcade
    ? { ground: '#111b24', water: '#07121d', park: '#17362f', block: '#1c2c37', road: '#6b929b', major: '#a3d3d7', edge: '#283f4c', text: '#d7e9ed', building: '#2a4757' }
    : { ground: '#20252c', water: '#111e2d', park: '#293e34', block: '#2b3038', road: '#79818d', major: '#d6c599', edge: '#414650', text: '#ece5d9', building: '#4b535e' };
  const major: ExpressionSpecification = ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false];
  const roadWidth: ExpressionSpecification = ['interpolate', ['exponential', 1.4], ['zoom'], 6, 0.5, 13, 2, 16, 7, 19, 20];
  const layers: LayerSpecification[] = [
    { id: 'ground', type: 'background', paint: { 'background-color': p.ground } },
    { id: 'landuse', type: 'fill', source: 'city', 'source-layer': 'landuse', paint: { 'fill-color': p.block, 'fill-opacity': 0.5 } },
    { id: 'green', type: 'fill', source: 'city', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['wood', 'grass'], true, false], paint: { 'fill-color': p.park } },
    { id: 'water', type: 'fill', source: 'city', 'source-layer': 'water', paint: { 'fill-color': p.water } },
    { id: 'building-footprints', type: 'fill', source: 'city', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': p.building, 'fill-opacity': 0.5 } },
    { id: 'road-edge', type: 'line', source: 'city', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'rail'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.edge, 'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 6, 1, 13, 4, 16, 10, 19, 26] } },
    { id: 'streets', type: 'line', source: 'city', 'source-layer': 'transportation', filter: ['match', ['get', 'class'], ['minor', 'tertiary', 'service', 'street', 'residential'], true, false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.road, 'line-width': roadWidth } },
    { id: 'main-roads', type: 'line', source: 'city', 'source-layer': 'transportation', filter: major, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.major, 'line-width': roadWidth } },
    { id: 'paths', type: 'line', source: 'city', 'source-layer': 'transportation', minzoom: 15, filter: ['==', ['get', 'class'], 'path'], paint: { 'line-color': p.road, 'line-width': 1, 'line-dasharray': [2, 2] } },
    { id: 'rail', type: 'line', source: 'city', 'source-layer': 'transportation', minzoom: 12, filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': '#627182', 'line-width': 1, 'line-dasharray': [3, 3] } },
    // Only extrude features with supplied heights. Never invent real-world heights.
    { id: 'buildings-3d', type: 'fill-extrusion', source: 'city', 'source-layer': 'building', minzoom: 15, filter: ['all', ['has', 'render_height'], ['>', ['get', 'render_height'], 0], ['!=', ['get', 'hide_3d'], true]], paint: { 'fill-extrusion-color': p.building, 'fill-extrusion-height': ['get', 'render_height'], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 } },
    { id: 'street-names', type: 'symbol', source: 'city', 'source-layer': 'transportation_name', minzoom: 14, layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-max-angle': 30, 'symbol-spacing': 350 }, paint: { 'text-color': p.text, 'text-halo-color': p.ground, 'text-halo-width': 2 } },
    { id: 'places', type: 'symbol', source: 'city', 'source-layer': 'place', layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 12, 15, 17], 'text-max-width': 9, 'text-padding': 20 }, paint: { 'text-color': p.text, 'text-halo-color': p.ground, 'text-halo-width': 2 } },
  ];
  return { version: 8, name: `GameNav ${theme}`, glyphs: GLYPHS_URL, sources: { city: { type: 'vector', url: TILEJSON_URL, attribution: MAP_ATTRIBUTION } }, light: { anchor: 'viewport', color: '#d3edff', intensity: 0.4, position: [1.5, 210, 45] }, transition: { duration: 400, delay: 0 }, layers };
}
