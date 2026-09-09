import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRealtimeServerMessage } from '../src/realtime/protocol';

const babyId = '11111111-1111-4111-8111-111111111111';
const parentId = '22222222-2222-4222-8222-222222222222';

test('signaling protocol accepts a scoped welcome and SDP message', () => {
  assert.deepEqual(
    parseRealtimeServerMessage(
      JSON.stringify({
        type: 'welcome',
        peerId: babyId,
        role: 'baby',
        peers: [{ peerId: parentId, role: 'parent' }],
      }),
    ),
    {
      type: 'welcome',
      peerId: babyId,
      role: 'baby',
      peers: [{ peerId: parentId, role: 'parent' }],
    },
  );
  assert.equal(
    parseRealtimeServerMessage(
      JSON.stringify({
        type: 'signal',
        fromPeerId: parentId,
        connectionId: babyId,
        description: { type: 'offer', sdp: 'v=0\r\n' },
      }),
    )?.type,
    'signal',
  );
});

test('signaling protocol rejects malformed or ambiguous messages', () => {
  assert.equal(parseRealtimeServerMessage('not-json'), null);
  assert.equal(
    parseRealtimeServerMessage(
      JSON.stringify({
        type: 'signal',
        fromPeerId: parentId,
        connectionId: babyId,
        description: { type: 'offer', sdp: 'v=0' },
        candidate: { candidate: 'candidate', sdpMid: null, sdpMLineIndex: null },
      }),
    ),
    null,
  );
});
