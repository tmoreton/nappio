import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeBabyDeviceStatus,
  formatBabyDeviceStatus,
  isBabyBatteryLow,
  parseBabyDeviceStatus,
  parseBabyDeviceStatusValue,
} from '../src/monitoring/baby-device-status';

test('Baby Unit power status safely round-trips through the data channel payload', () => {
  const status = { batteryLevel: 0.82, isCharging: true, lowPowerMode: false };
  assert.deepEqual(parseBabyDeviceStatus(encodeBabyDeviceStatus(status)), status);
  assert.deepEqual(parseBabyDeviceStatusValue(status), status);
});

test('malformed Baby Unit status is ignored', () => {
  assert.equal(
    parseBabyDeviceStatus(new TextEncoder().encode('{"batteryLevel":4,"isCharging":true}')),
    null,
  );
  assert.equal(parseBabyDeviceStatus(new TextEncoder().encode('not json')), null);
  assert.equal(parseBabyDeviceStatusValue({ batteryLevel: 0.4, lowPowerMode: false }), null);
});

test('low battery requires a known level at or below twenty percent while unplugged', () => {
  assert.equal(
    isBabyBatteryLow({ batteryLevel: 0.2, isCharging: false, lowPowerMode: false }),
    true,
  );
  assert.equal(
    isBabyBatteryLow({ batteryLevel: 0.1, isCharging: true, lowPowerMode: false }),
    false,
  );
  assert.equal(
    isBabyBatteryLow({ batteryLevel: null, isCharging: false, lowPowerMode: false }),
    false,
  );
});

test('device status copy reports power and freshness without trusting device clocks', () => {
  assert.equal(
    formatBabyDeviceStatus(
      {
        batteryLevel: 0.82,
        isCharging: true,
        lowPowerMode: false,
        receivedAt: 1_000,
      },
      6_000,
    ),
    'Baby phone · Charging · 82% · Updated now',
  );
});
