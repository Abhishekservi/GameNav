// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // The nested directory is a separate starter app, outside this app's source.
    ignores: ['dist/**', 'gamenav/**'],
  },
]);
