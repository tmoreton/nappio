# Nappio production runbook

## Production services

- Pairing/signaling Worker: `https://nappio-pairing-api.tmoreton89.workers.dev`
- Cloudflare Durable Objects: `PAIRINGS`, SQLite-backed, 100 routed shards plus the legacy coordinator
- Cloudflare Realtime TURN: credentials minted by the Worker only when direct WebRTC needs a relay
- Mobile delivery: EAS Update `production` channel for compatible JavaScript/assets; a new App Store build for native changes
- Public policy/support site: `https://tmoreton.github.io/nappio/`

## Required secrets and controls

Worker secrets, set with `wrangler secret put`, are `SESSION_SECRET`, `TURN_KEY_ID`, and `TURN_KEY_API_TOKEN`. Never place them in an Expo public variable, repository file, Actions log, issue, or support message.

The GitHub repository needs `CLOUDFLARE_ACCOUNT_ID`. Its `production` environment needs:

- `CLOUDFLARE_API_TOKEN`, scoped to the Nappio Worker deployment permissions for this account
- deployment protection and a reviewer if the repository plan supports it

Repository Actions also needs `CLOUDFLARE_ANALYTICS_TOKEN` with account analytics read access. Set `TURN_DAILY_EGRESS_WARN_GB` to the daily egress level that should fail the TURN usage workflow; the default is 30 GB.

## Verify a release candidate

From a clean checkout:

```sh
npm ci
npm --prefix worker ci
npm run check
npx expo-doctor
EXPO_WEB_BASE_URL=/nappio npx expo export --platform web
npm --prefix worker run deploy -- --dry-run
```

Run the Worker locally in another terminal, then exercise its complete HTTP lifecycle:

```sh
npm run worker:dev
npm run worker:load-test
```

## First sharding deployment

Do this two-step sequence only for the first production release containing routed tokens:

1. Deploy the new Worker with `SHARDED_PAIRINGS_ENABLED` temporarily set to `false`. Its health response must show `routing: legacy-compatible`. This version accepts old and routed credentials but issues only old-format credentials.
2. Exercise create, multi-parent join, resume, signaling WebSockets, explicit end, and forced TURN. Confirm the existing TestFlight build still works.
3. Deploy the same verified source with the repository value `SHARDED_PAIRINGS_ENABLED: true`. Health must show `routing: sharded`.
4. Create a room and confirm the pairing code's first two digits match the `sNN_` prefix on its recovery token. Re-run the lifecycle probe and physical-device checks.

This order ensures the immediately previous Cloudflare version understands routed credentials. Do not roll back past that compatibility version after sharded rooms have been issued.

## Normal deployment

After the first migration, merging a verified change to `main` runs the Worker deployment, OTA update, public-site deployment, and quality workflows. Deploy the Worker before publishing client code that depends on a new API response or route. The Worker must remain backward-compatible with the currently distributed App Store/TestFlight build.

After deployment:

1. Confirm `/health` reports `status`, `storage`, `signaling`, and `turn` as healthy/configured, with `routing: sharded`.
2. Run a small production lifecycle probe:

   ```sh
   NAPPIO_WORKER_URL=https://nappio-pairing-api.tmoreton89.workers.dev \
   ALLOW_PRODUCTION_LOAD_TEST=true LOAD_TEST_ROOMS=10 npm run worker:load-test
   ```

3. Review Worker errors and the latest TURN analytics.
4. Test at least two real phones across Wi-Fi and cellular before widening release availability.

## Monitoring and cost guardrails

- `.github/workflows/health.yml` checks the Worker and public privacy/support page hourly.
- `.github/workflows/turn-usage.yml` reads the previous UTC day's TURN egress and fails above the configured threshold.
- The Worker emits a small anonymous `webrtc_connection` event with only `direct` or `relay`; use its ratio to validate cost assumptions.
- Cloudflare TURN credentials include a one-way, room-derived `customIdentifier` for investigating unusual relay consumption without exposing the actual room ID.
- Review GitHub Actions notification delivery and Cloudflare billing notifications before launch. A failed scheduled workflow is useful only if somebody receives it.

## Incident response

For elevated errors, stop release promotion, check `/health`, Worker logs, Durable Object errors, and TURN credential-generation errors. If only a client release is affected, stop the OTA rollout or publish a corrected compatible update. Do not rotate `SESSION_SECRET` as a routine response: rotation invalidates every existing recovery credential.

For unexpected TURN spend, inspect egress and concurrency by time and attribution, then determine whether relay percentage or total session hours changed. TURN remains encrypted packet forwarding; it cannot decode live media.

For suspected credential exposure:

1. Replace the exposed GitHub/Cloudflare credential at its issuer.
2. Update the Worker or GitHub secret without printing the new value.
3. Redeploy and verify health plus a forced-TURN connection.
4. Revoke the old credential.

## Rollback

Use Cloudflare's deployment history to select the last verified compatible version. After sharding is enabled, the target must understand `sNN_` credentials. Prefer a forward fix if no safe compatible rollback exists. Re-run health, lifecycle, and real-device checks after rollback. The Durable Object schema changes are additive; never delete tables or columns as part of an emergency rollback.

Record the deployed version, verification result, incident details, and any follow-up action in the release or issue that triggered the operation.
