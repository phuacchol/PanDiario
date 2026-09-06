// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // scripts/cmd-guard/vendor: código de terceros vendorizado tal cual
    // (ver cabecera de wildcard-match.js) — no se reformatea para no
    // divergir del upstream si se necesita actualizar la copia.
    ignores: ['dist/*', 'scripts/cmd-guard/vendor/**'],
  },
]);
