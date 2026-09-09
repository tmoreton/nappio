import { AccessToken, TrackSource } from 'livekit-server-sdk';

export type ParticipantRole = 'baby' | 'parent';

export interface TokenService {
  createToken(role: ParticipantRole, roomId: string): Promise<string>;
}

export class LiveKitTokenService implements TokenService {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly ttlSeconds: number,
  ) {}

  async createToken(role: ParticipantRole, roomId: string) {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: `${role}-${crypto.randomUUID()}`,
      name: role === 'baby' ? 'Baby Unit' : 'Parent Unit',
      ttl: this.ttlSeconds,
      attributes: { role },
    });
    token.addGrant({
      room: roomId,
      roomJoin: true,
      canPublish: true,
      canPublishSources:
        role === 'baby'
          ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
          : [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: role === 'baby',
    });
    return token.toJwt();
  }
}
