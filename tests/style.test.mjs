import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { createMapStyle } from '../src/maps/style.ts';

for (const theme of ['classic', 'arcade']) {
  for (const showBuildings of [false, true]) {
    test(`${theme} ${showBuildings ? '3D' : '2D'} style passes the installed MapLibre style validator`, () => {
      const errors = validateStyleMin(createMapStyle(theme, showBuildings));
      assert.deepEqual(errors.map(error => error.message), []);
    });
  }
}
