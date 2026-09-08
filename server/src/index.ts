import { loadServerConfig } from './config';
import { createPairingServer } from './http-server';
import { LiveKitTokenService } from './token-service';

try {
  process.loadEnvFile('server/.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error;
  }
}

const config = loadServerConfig();
const tokens = new LiveKitTokenService(
  config.livekitApiKey,
  config.livekitApiSecret,
  config.tokenTtlSeconds,
);
const server = createPairingServer({ config, tokens });

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Nappio pairing server listening on http://0.0.0.0:${config.port}`);
});
