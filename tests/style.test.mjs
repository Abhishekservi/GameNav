import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { createMapStyle } from '../src/maps/style.ts';

for (const theme of ['classic', 'arcade']) {
  test(`${theme} style passes the installed MapLibre style validator`, () => {
    const errors = validateStyleMin(createMapStyle(theme));
    assert.deepEqual(errors.map(error => error.message), []);
  });
}
