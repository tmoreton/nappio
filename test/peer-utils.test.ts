import assert from 'node:assert/strict';
import test from 'node:test';

import { audioLevelFromStats, iceTransportFromStats } from '../src/realtime/peer-utils';

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

test('connection stats distinguish direct and relayed candidate pairs', () => {
  const base = [
    { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' },
    {
      id: 'pair',
      type: 'candidate-pair',
      localCandidateId: 'local',
      remoteCandidateId: 'remote',
    },
    { id: 'remote', type: 'remote-candidate', candidateType: 'srflx' },
  ];
  assert.equal(
    iceTransportFromStats([...base, { id: 'local', type: 'local-candidate', candidateType: 'host' }]),
    'direct',
  );
  assert.equal(
    iceTransportFromStats([...base, { id: 'local', type: 'local-candidate', candidateType: 'relay' }]),
    'relay',
  );
});

test('connection stats fall back to the nominated successful pair', () => {
  assert.equal(
    iceTransportFromStats([
      {
        id: 'pair',
        type: 'candidate-pair',
        nominated: true,
        state: 'succeeded',
        localCandidateId: 'local',
        remoteCandidateId: 'remote',
      },
      { id: 'local', type: 'local-candidate', candidateType: 'prflx' },
      { id: 'remote', type: 'remote-candidate', candidateType: 'relay' },
    ]),
    'relay',
  );
});
