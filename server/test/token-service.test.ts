import assert from 'node:assert/strict';
import test from 'node:test';

import { LiveKitTokenService, type ParticipantRole } from '../src/token-service';

type TokenPayload = {
  attributes: { role: ParticipantRole };
  sub: string;
  video: {
    room: string;
    roomJoin: boolean;
    canPublish: boolean;
    canPublishData: boolean;
    canPublishSources?: string[];
    canSubscribe: boolean;
  };
};

function decodePayload(token: string): TokenPayload {
  const encodedPayload = token.split('.')[1];
  assert.ok(encodedPayload, 'token should contain a JWT payload');
  return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
}

const tokens = new LiveKitTokenService(
  'APItestkey',
  '01234567890123456789012345678901',
  3600,
);

test('baby token can publish monitoring media and subscribe to parent talk audio', async () => {
  const payload = decodePayload(await tokens.createToken('baby', 'private-room'));

  assert.equal(payload.attributes.role, 'baby');
  assert.match(payload.sub, /^baby-/);
  assert.equal(payload.video.room, 'private-room');
  assert.equal(payload.video.roomJoin, true);
  assert.equal(payload.video.canPublish, true);
  assert.deepEqual(payload.video.canPublishSources, ['camera', 'microphone']);
  assert.equal(payload.video.canSubscribe, true);
  assert.equal(payload.video.canPublishData, true);
});

test('parent token can subscribe and can publish only push-to-talk microphone audio', async () => {
  const payload = decodePayload(await tokens.createToken('parent', 'private-room'));

  assert.equal(payload.attributes.role, 'parent');
  assert.match(payload.sub, /^parent-/);
  assert.equal(payload.video.room, 'private-room');
  assert.equal(payload.video.roomJoin, true);
  assert.equal(payload.video.canPublish, true);
  assert.equal(payload.video.canSubscribe, true);
  assert.equal(payload.video.canPublishData, false);
  assert.deepEqual(payload.video.canPublishSources, ['microphone']);
});
