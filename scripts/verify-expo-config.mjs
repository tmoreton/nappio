import { spawnSync } from 'node:child_process';

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(executable, ['expo', 'config', '--type', 'introspect', '--json'], {
  encoding: 'utf8',
  env: { ...process.env, EXPO_NO_DOTENV: '1' },
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const config = JSON.parse(result.stdout);
const entitlements = config._internal?.modResults?.ios?.entitlements ?? {};

if (Object.hasOwn(entitlements, 'aps-environment')) {
  throw new Error(
    'Nappio uses local notifications only; the generated iOS app must not include the APNs entitlement.',
  );
}

console.log('Expo native config verified: local notifications do not request APNs.');
