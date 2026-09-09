import assert from 'node:assert/strict';
import test from 'node:test';

import { audioLevelFromStats } from '../src/realtime/peer-utils';

test('audio stats use the direct level when the platform provides one', () => {
  assert.equal(
    audioLevelFromStats(
      [{ type: 'inbound-rtp', kind: 'audio', audioLevel: 0.42 }],
      null,
    ).level,
    0.42,
  );
});

test('audio stats derive RMS level from cumulative energy samples', () => {
  const first = audioLevelFromStats(
    [{ type: 'inbound-rtp', mediaType: 'audio', totalAudioEnergy: 2, totalSamplesDuration: 4 }],
    null,
  );
  const second = audioLevelFromStats(
    [{ type: 'inbound-rtp', mediaType: 'audio', totalAudioEnergy: 2.25, totalSamplesDuration: 5 }],
    first.sample,
  );
  assert.equal(second.level, 0.5);
});
