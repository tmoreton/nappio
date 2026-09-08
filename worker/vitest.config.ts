import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          LIVEKIT_API_KEY: 'APItestkey',
          LIVEKIT_API_SECRET: '01234567890123456789012345678901',
        },
      },
    }),
  ],
});
