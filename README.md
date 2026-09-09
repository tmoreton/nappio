# Nappio

Nappio turns phones into a private baby monitor. The Baby Unit sends its rear camera and microphone directly to up to three Parent Units over WebRTC; each Parent can watch the encrypted stream, talk back, or switch to true audio-only mode for locked-screen listening.

This repository contains the Expo SDK 57 app and its Cloudflare Worker. The Worker handles temporary pairing and WebSocket signaling. Media normally travels phone-to-phone and uses Cloudflare TURN only when the devices cannot make a direct connection. Nappio never records it.

- Landing page: [tmoreton.github.io/nappio](https://tmoreton.github.io/nappio/)
- Expo project: [@reactnativenerd/Nappio](https://expo.dev/accounts/reactnativenerd/projects/Nappio)

The public landing page is implemented as the web-specific home route. A GitHub Actions workflow exports the static Expo site with the `/nappio` base path and deploys it to GitHub Pages whenever `main` changes.

## What is implemented

- Baby Unit camera and microphone publishing with local preview
- screen wake lock and dimmed monitoring view
- reusable five-minute room invites by six-digit code or QR code
- QR-code pairing and `nappio://` deep links
- single-use, role-scoped signaling tickets
- WebRTC DTLS-SRTP encryption for audio, video, and data
- Parent Unit remote video and audio playback
- multiple Parent Units in one room, each with independent session recovery
- hold-to-talk audio from any Parent Unit to the Baby Unit
- true audio-only mode that stops the Baby Unit's video sender for that Parent
- automatic audio-only mode when the Parent app backgrounds
- iOS background-audio capability and native audio-route picker
- connected, reconnecting, disconnected, unavailable, and failure states
- optional local alerts for sustained sound or a dropped connection while monitoring in the background
- adjustable sound-alert sensitivity, a test alert, and time-sensitive iOS notifications
- Baby Unit battery, charging, and freshness status with low-power alerts
- manual iOS Picture in Picture for live video
- renewable 30-day role-scoped session recovery protected by iOS Keychain or Android Keystore
- immediate server-side room/session revocation when a saved session is replaced or ended
- request size limits, no-store responses, and layered per-installation/per-address pairing rate limits
- a public HTTPS pairing API backed by a SQLite Durable Object
- deterministic routing across 100 SQLite Durable Object shards, with legacy-session compatibility
- automatic expiry cleanup using Durable Object alarms
- anonymous direct-versus-relay connection telemetry and attributed TURN usage monitoring
- local protocol tests and Cloudflare-runtime integration tests
- public privacy/support information, scheduled production health and TURN-budget checks, and reproducible Worker deployments

## Requirements

- Node.js 22.13 or newer
- Xcode 26.4 or newer for SDK 57 iOS builds
- two physical iPhones for the main flow; three for multi-parent testing
- an Apple Developer team for installing development builds on physical devices
- a Cloudflare account for production Worker deployments
- a Cloudflare Realtime TURN key for reliable connections across restrictive networks

Expo Go cannot run this app because monitoring requires native WebRTC modules.

## Configure locally

Install dependencies:

```sh
npm install
```

Copy the Worker template. Set a unique `SESSION_SECRET` with at least 32 characters. TURN credentials are optional for local same-network testing.

```sh
cp worker/.dev.vars.example worker/.dev.vars
npm run worker:dev
```

Create the app environment file. For physical devices, use the deployed HTTPS pairing service:

```sh
cp .env.example .env
```

For a physical device, set `EXPO_PUBLIC_API_BASE_URL` to the deployed HTTPS Worker URL. For a simulator, Wrangler's default local URL is `http://127.0.0.1:8787`; a physical device needs a reachable LAN address or the deployed Worker.

## Production pairing API

The TestFlight production environment uses:

```text
https://nappio-pairing-api.tmoreton89.workers.dev
```

The Worker stores expiring room invites, hashed session-recovery credentials, single-use signaling tickets, and short-lived rate limits across 100 deterministically selected SQLite-backed Durable Objects. It relays only WebRTC connection descriptions and candidates over hibernating WebSockets. An invite can add multiple Parent Units during its five-minute lifetime. Each role has an independent 30-day expiry that renews during authenticated use; ending a Baby room revokes the whole room, while replacing a Parent session revokes only that Parent.

For local Worker development:

```sh
cp worker/.dev.vars.example worker/.dev.vars
npm run worker:dev
```

Create a TURN key in Cloudflare Realtime, then deploy and set all three Worker secrets. Never put any of them in an `EXPO_PUBLIC_` variable.

```sh
npm run worker:deploy
npx wrangler secret put SESSION_SECRET --config worker/wrangler.jsonc
npx wrangler secret put TURN_KEY_ID --config worker/wrangler.jsonc
npx wrangler secret put TURN_KEY_API_TOKEN --config worker/wrangler.jsonc
```

Without the TURN secrets, the Worker deliberately returns Cloudflare's free STUN server only. That is useful for development, but some carrier, hotel, school, and corporate networks will fail to connect.

Production deploys are automated by `.github/workflows/worker.yml`. Configure `CLOUDFLARE_ACCOUNT_ID` as a repository secret and a narrowly scoped `CLOUDFLARE_API_TOKEN` in the `production` GitHub environment. Configure `CLOUDFLARE_ANALYTICS_TOKEN` plus the optional `TURN_DAILY_EGRESS_WARN_GB` repository variable for the daily TURN budget check. See [the production runbook](docs/production-runbook.md) for the staged sharding migration, verification, rotation, and rollback procedures.

## Run on two physical iPhones

Start the Worker locally in one terminal, or configure the app to use the deployed Worker:

```sh
npm run worker:dev
```

Build and install the native development client on the first connected iPhone:

```sh
npx expo run:ios --device
```

Install the same development build on the second iPhone by running the command again and selecting that device. After both have the client installed, start Metro on the LAN:

```sh
npx expo start --dev-client --lan
```

Open Nappio on both phones and select the development server. One phone chooses **Use as Baby Camera** and the other chooses **Monitor Baby**.

An EAS development build is also configured:

```sh
npx eas-cli build --profile development --platform ios
```

## Checks

Run the full repeatable local verification suite:

```sh
npm run check
npx expo-doctor
EXPO_WEB_BASE_URL=/nappio npx expo export --platform web
npm --prefix worker run deploy -- --dry-run
```

For a bounded API load probe, start the local Worker and run `npm run worker:load-test`. The script defaults to 25 rooms, cleans each one up, and refuses to target production unless `ALLOW_PRODUCTION_LOAD_TEST=true` is explicitly set.

## Physical-device test checklist

1. Start the Baby Unit and allow camera/microphone access.
2. Confirm the rear-camera preview appears and the app does not let the screen sleep.
3. Enter or scan the displayed code on the Parent Unit.
4. Confirm the Baby Unit says **1 parent connected**.
5. Confirm live video and audio reach the Parent Unit.
6. While the invite is still visible, join from a second Parent iPhone and confirm the Baby Unit says **2 parents connected** and both receive the stream.
7. On each Parent Unit, hold **Hold to talk**, speak, and verify the Baby Unit plays audio only while the button is held.
8. Tap **Audio Only** and verify video network traffic for that Parent falls to zero while audio continues.
9. Lock the Parent iPhone and listen continuously for at least 30 minutes.
10. With monitoring alerts enabled, send a test alert, make sustained sound near the Baby Unit, and verify the locked Parent phone receives a sound alert; then disconnect the Baby Unit and verify the interruption warning appears.
11. Confirm the Baby Unit battery/charging status updates, and verify the low-battery and unplugged alerts.
12. Unlock it, tap **Show Video**, and verify video returns; on iOS, start **PiP** and verify video remains visible over another app.
13. Briefly enable airplane mode, then disable it and verify **Reconnecting** returns to **Monitoring live**.
14. Force-quit and reopen each role, then use **Continue** and verify the same session reconnects.
15. Repeat with Wi-Fi/cellular transitions and Bluetooth connect/disconnect.
16. End monitoring from each role and verify the camera, microphone, audio session, and saved Continue action release.

## Security notes

- `worker/.dev.vars` and all local `.env` variants are ignored by Git.
- Recovery credentials authorize only a Baby or Parent signaling role. Single-use signaling tickets expire after 60 seconds.
- WebRTC encrypts media and control data between devices with DTLS-SRTP. A TURN relay forwards encrypted packets and cannot decode the camera, microphone, or push-to-talk media.
- Room invites can be reused by multiple Parent Units and expire after five minutes.
- Each Parent Unit receives a separate recovery token. Role-specific recovery tokens are stored only as SHA-256 hashes by the Worker and renew for 30 days during active authenticated use.
- Up to three simultaneous Parent signaling connections are allowed. The Baby Unit creates a separate encrypted peer connection for each Parent, trading a small amount of Baby-side upload and battery use for minimal relay cost.
- The first two digits of a new pairing code route create/join/signaling operations to one of 100 Durable Object shards. Each shard keeps its own create-and-claim operations atomic. Pre-sharding recovery tokens remain supported until they expire.
- A random installation UUID and Cloudflare's edge address counter provide layered pairing-abuse limits. The UUID is not an Apple advertising identifier and is not used for tracking.
- TURN credentials are generated server-side and are never compiled into the mobile app.
- TURN credentials carry a one-way room attribution identifier. Parent Units report only whether WebRTC selected a direct or relayed path; no room or device identifier is included in that Worker log event.
- The public health endpoint reports storage, signaling-secret, and TURN configuration without exposing credentials.

## Launch material

- [Launch checklist](docs/launch-checklist.md)
- [App Store metadata draft](docs/app-store-metadata.md)
- Privacy policy: [tmoreton.github.io/nappio/#privacy-policy](https://tmoreton.github.io/nappio/#privacy-policy)
- Support: [tmoreton.github.io/nappio/#support](https://tmoreton.github.io/nappio/#support)
