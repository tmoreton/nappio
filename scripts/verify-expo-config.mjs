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
const backgroundModes = config.ios?.infoPlist?.UIBackgroundModes ?? [];
const androidPermissions = config.android?.permissions ?? [];

if (Object.hasOwn(entitlements, 'aps-environment')) {
  throw new Error(
    'Nappio uses local notifications only; the generated iOS app must not include the APNs entitlement.',
  );
}

if (new Set(backgroundModes).size !== backgroundModes.length) {
  throw new Error('iOS background modes must not contain duplicates.');
}

if (new Set(androidPermissions).size !== androidPermissions.length) {
  throw new Error('Android permissions must not contain duplicates.');
}

if (!config.updates?.url || !config.runtimeVersion) {
  throw new Error('EAS Update requires updates.url and runtimeVersion in the Expo config.');
}

console.log('Expo native config verified: local notifications and EAS Update are configured.');
