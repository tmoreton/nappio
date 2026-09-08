export type ServerConfig = {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  port: number;
  pairingTtlMs: number;
  tokenTtlSeconds: number;
};

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const livekitUrl = env.LIVEKIT_URL?.trim();
  const livekitApiKey = env.LIVEKIT_API_KEY?.trim();
  const livekitApiSecret = env.LIVEKIT_API_SECRET?.trim();

  if (!livekitUrl || !/^wss:\/\//.test(livekitUrl)) {
    throw new Error('LIVEKIT_URL must be set to a secure wss:// URL.');
  }
  if (!livekitApiKey || !livekitApiSecret) {
    throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set.');
  }

  return {
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    port: positiveInteger(env.PORT, 8787, 'PORT'),
    pairingTtlMs: positiveInteger(env.PAIRING_TTL_SECONDS, 300, 'PAIRING_TTL_SECONDS') * 1000,
    tokenTtlSeconds: positiveInteger(env.TOKEN_TTL_SECONDS, 21_600, 'TOKEN_TTL_SECONDS'),
  };
}
