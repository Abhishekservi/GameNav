import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';

export type MapTheme = 'classic' | 'arcade';
export const MUMBAI: [number, number] = [72.8311, 18.9435];

// OpenMapTiles-compatible TileJSON, not a demonstration tile service.
export const TILEJSON_URL = process.env.EXPO_PUBLIC_MAP_TILEJSON_URL || 'https://tiles.openfreemap.org/planet';
export const IS_DEFAULT_PROVIDER = TILEJSON_URL === 'https://tiles.openfreemap.org/planet';
export const GLYPHS_URL = process.env.EXPO_PUBLIC_MAP_GLYPHS_URL || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const MAP_ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_ATTRIBUTION || (IS_DEFAULT_PROVIDER ? '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://openmaptiles.org">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' : undefined);

export function createMapStyle(theme: MapTheme, showBuildings = false): StyleSpecification {
  const arcade = theme === 'arcade';
  const p = arcade
    ? { ground: '#1b1b1b', water: '#797979', park: '#272727', block: '#181818', road: '#a5a5a5', major: '#b4b4b4', edge: '#111111', text: '#d5d5d5', building: '#353535' }
    : { ground: '#20252c', water: '#111e2d', park: '#293e34', block: '#2b3038', road: '#79818d', major: '#d6c599', edge: '#414650', text: '#ece5d9', building: '#4b535e' };
  const major: ExpressionSpecification = ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary'], true, false];
  const roadWidth: ExpressionSpecification = ['interpolate', ['exponential', 1.4], ['zoom'], 6, 0.5, 13, 2, 16, 7, 19, 20];
  const arcadeRoads: LayerSpecification[] = [];
  // Draw each road hierarchy with its own casing. Service lanes must not be as
  // heavy as highways, especially in Mumbai's dense street network.
  const roadGroups = [
    { id: 'service', classes: ['service'], minzoom: 15, widths: [0.5, 1.1, 3.5, 9] },
    { id: 'local', classes: ['minor', 'tertiary', 'street', 'residential'], minzoom: 11, widths: [0.6, 2.1, 5.8, 14] },
    { id: 'arterial', classes: ['secondary', 'primary'], minzoom: 8, widths: [1, 3.6, 8.5, 19] },
    { id: 'highway', classes: ['motorway', 'trunk'], minzoom: 5, widths: [1.5, 4.8, 11, 23] },
  ];
  for (const bridge of [false, true]) {
    for (const group of roadGroups) {
      const prefix = `${bridge ? 'bridge' : 'road'}-${group.id}`;
      const width = (casing: boolean): ExpressionSpecification => [
        'interpolate', ['exponential', 1.3], ['zoom'],
        10, group.widths[0] + (casing ? 1.4 : 0),
        14, group.widths[1] + (casing ? 2.2 : 0),
        16, group.widths[2] + (casing ? 3 : 0),
        19, group.widths[3] + (casing ? 4 : 0),
      ];
      const filter: ExpressionSpecification = ['all',
        ['match', ['get', 'class'], group.classes, true, false],
        [bridge ? '==' : '!=', ['get', 'brunnel'], 'bridge'],
      ];
      for (const casing of [true, false]) {
        arcadeRoads.push({
          id: `${prefix}-${casing ? 'outline' : 'surface'}`,
          type: 'line', source: 'city', 'source-layer': 'transportation',
          minzoom: bridge ? Math.max(12, group.minzoom) : group.minzoom,
          filter, layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': casing ? p.edge : group.id === 'highway' ? p.major : p.road,
            'line-width': width(casing),
            'line-opacity': ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.55, 1],
          },
        });
      }
    }
  }
  const layers: LayerSpecification[] = [
    { id: 'ground', type: 'background', paint: { 'background-color': p.ground } },
    { id: 'landuse', type: 'fill', source: 'city', 'source-layer': 'landuse', paint: { 'fill-color': arcade ? ['match', ['get', 'class'], ['park', 'recreation_ground', 'cemetery'], p.park, p.block] : p.block, 'fill-opacity': arcade ? 0.8 : 0.5 } },
    { id: 'green', type: 'fill', source: 'city', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['wood', 'grass'], true, false], paint: { 'fill-color': p.park } },
    { id: 'water', type: 'fill', source: 'city', 'source-layer': 'water', paint: { 'fill-color': p.water } },
    { id: 'shoreline', type: 'line', source: 'city', 'source-layer': 'water', paint: { 'line-color': arcade ? '#111111' : p.edge, 'line-width': 1.3 } },
    { id: 'building-footprints', type: 'fill', source: 'city', 'source-layer': 'building', minzoom: arcade ? 14 : 13, paint: { 'fill-color': p.building, 'fill-opacity': arcade ? 0.7 : 0.5 } },
    ...(arcade ? arcadeRoads : [
    { id: 'road-edge', type: 'line', source: 'city', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'rail'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.edge, 'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 6, 1, 13, 4, 16, 10, 19, 26] } } as LayerSpecification,
    { id: 'streets', type: 'line', source: 'city', 'source-layer': 'transportation', filter: ['match', ['get', 'class'], ['minor', 'tertiary', 'service', 'street', 'residential'], true, false], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.road, 'line-width': roadWidth } },
    { id: 'main-roads', type: 'line', source: 'city', 'source-layer': 'transportation', filter: major, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.major, 'line-width': roadWidth } },
    ] as LayerSpecification[]),
    { id: 'paths', type: 'line', source: 'city', 'source-layer': 'transportation', minzoom: arcade ? 17 : 15, filter: ['==', ['get', 'class'], 'path'], paint: { 'line-color': p.road, 'line-width': 1, 'line-dasharray': [2, 2] } },
    { id: 'rail', type: 'line', source: 'city', 'source-layer': 'transportation', minzoom: arcade ? 14 : 12, filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': arcade ? '#484848' : '#627182', 'line-width': 1, 'line-dasharray': [3, 3] } },
    // Only extrude features with supplied heights. Never invent real-world heights.
    { id: 'buildings-3d', type: 'fill-extrusion', source: 'city', 'source-layer': 'building', minzoom: 15, layout: { visibility: showBuildings ? 'visible' : 'none' }, filter: ['all', ['has', 'render_height'], ['>', ['get', 'render_height'], 0], ['!=', ['get', 'hide_3d'], true]], paint: { 'fill-extrusion-color': p.building, 'fill-extrusion-height': ['get', 'render_height'], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 } },
    { id: 'street-names', type: 'symbol', source: 'city', 'source-layer': 'transportation_name', minzoom: arcade ? 17.5 : 14, layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': arcade ? 10 : 12, 'text-max-angle': 25, 'symbol-spacing': arcade ? 550 : 350 }, paint: { 'text-color': p.text, 'text-halo-color': p.ground, 'text-halo-width': 1.5 } },
    { id: 'places', type: 'symbol', source: 'city', 'source-layer': 'place', minzoom: arcade ? 16 : 0, layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-transform': arcade ? 'uppercase' : 'none', 'text-letter-spacing': arcade ? 0.12 : 0, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 15, arcade ? 12 : 17], 'text-max-width': 9, 'text-padding': arcade ? 60 : 20 }, paint: { 'text-color': p.text, 'text-halo-color': p.ground, 'text-halo-width': 1.5 } },
  ];
  return { version: 8, name: `GameNav ${theme}`, glyphs: GLYPHS_URL, sources: { city: { type: 'vector', url: TILEJSON_URL, attribution: MAP_ATTRIBUTION } }, light: { anchor: 'viewport', color: arcade ? '#ffffff' : '#d3edff', intensity: 0.4, position: [1.5, 210, 45] }, transition: { duration: 400, delay: 0 }, layers };
}
