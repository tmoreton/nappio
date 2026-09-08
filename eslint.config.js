// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'ios/**/*', 'android/**/*'],
    settings: {
      "import/resolver": {
        node: {
          extensions: [
            ".ts",
            ".tsx",
            ".native.ts",
            ".native.tsx",
            ".web.ts",
            ".web.tsx",
            ".js",
            ".jsx",
          ],
        },
        typescript: true,
      },
    },
  }
]);
