import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceSoundAlertDetector,
  createSoundAlertDetectorState,
  isSoundAlertSensitivity,
  soundAlertConfigForSensitivity,
  type SoundAlertDetectorConfig,
} from '../src/monitoring/sound-alert-detector';

test('sound sensitivity presets become progressively easier to trigger', () => {
  const low = soundAlertConfigForSensitivity('low');
  const standard = soundAlertConfigForSensitivity('standard');
  const high = soundAlertConfigForSensitivity('high');

  assert.ok(low.threshold > standard.threshold);
  assert.ok(standard.threshold > high.threshold);
  assert.ok(low.sustainedForMs > standard.sustainedForMs);
  assert.ok(standard.sustainedForMs > high.sustainedForMs);
  assert.equal(isSoundAlertSensitivity('standard'), true);
  assert.equal(isSoundAlertSensitivity('maximum'), false);
});

const config: SoundAlertDetectorConfig = {
  threshold: 0.1,
  sustainedForMs: 1_000,
  cooldownMs: 60_000,
};

test('sound alerts require sustained volume above the threshold', () => {
  let state = createSoundAlertDetectorState();
  let result = advanceSoundAlertDetector(state, 0.2, 1_000, config);
  assert.equal(result.shouldNotify, false);

  state = result.state;
  result = advanceSoundAlertDetector(state, 0.2, 1_999, config);
  assert.equal(result.shouldNotify, false);

  result = advanceSoundAlertDetector(result.state, 0.2, 2_000, config);
  assert.equal(result.shouldNotify, true);
});

test('brief sound spikes reset instead of creating an alert', () => {
  let result = advanceSoundAlertDetector(createSoundAlertDetectorState(), 0.2, 1_000, config);
  result = advanceSoundAlertDetector(result.state, 0.02, 1_500, config);
  result = advanceSoundAlertDetector(result.state, 0.2, 1_900, config);
  result = advanceSoundAlertDetector(result.state, 0.2, 2_500, config);

  assert.equal(result.shouldNotify, false);
});

test('sound alerts use a cooldown and require a fresh sustained sound afterward', () => {
  let result = advanceSoundAlertDetector(createSoundAlertDetectorState(), 0.2, 1_000, config);
  result = advanceSoundAlertDetector(result.state, 0.2, 2_000, config);
  assert.equal(result.shouldNotify, true);

  result = advanceSoundAlertDetector(result.state, 0.2, 30_000, config);
  assert.equal(result.shouldNotify, false);

  result = advanceSoundAlertDetector(result.state, 0.2, 62_000, config);
  assert.equal(result.shouldNotify, false);
  result = advanceSoundAlertDetector(result.state, 0.2, 63_000, config);
  assert.equal(result.shouldNotify, true);
});
