# Nappio

Nappio turns two phones into a private baby monitor. The Baby Unit publishes its rear camera and microphone to LiveKit; the Parent Unit watches the encrypted stream or switches to true audio-only mode for locked-screen listening.

This repository contains the Expo SDK 57 app, a local TypeScript pairing/token server, and a production Cloudflare Worker. Media travels through LiveKit and is never handled or recorded by the pairing server.

- Landing page: [tmoreton.github.io/nappio](https://tmoreton.github.io/nappio/)
- Expo project: [@reactnativenerd/Nappio](https://expo.dev/accounts/reactnativenerd/projects/Nappio)

The public landing page is implemented as the web-specific home route. A GitHub Actions workflow exports the static Expo site with the `/nappio` base path and deploys it to GitHub Pages whenever `main` changes.

## What is implemented

- Baby Unit camera and microphone publishing with local preview
- screen wake lock and dimmed monitoring view
- random single-use six-digit pairing codes with a five-minute expiry
- QR-code pairing and `nappio://` deep links
- role-restricted server-generated LiveKit tokens
- LiveKit E2EE for audio, video, and data frames
- Parent Unit remote video and audio playback
- true audio-only mode that unsubscribes from camera tracks
- automatic audio-only mode when the Parent app backgrounds
- iOS background-audio capability and native audio-route picker
- connected, reconnecting, disconnected, unavailable, and failure states
- optional local alerts for sustained sound or a dropped connection while monitoring in the background
- 24-hour role-scoped session recovery protected by iOS Keychain or Android Keystore
- request size limits, no-store responses, and per-address pairing rate limits
- a public HTTPS pairing API backed by a SQLite Durable Object
- automatic expiry cleanup using Durable Object alarms
- local server tests and Cloudflare-runtime integration tests
- public privacy/support information and scheduled production health checks

## Requirements

- Node.js 22.13 or newer
- Xcode 26.4 or newer for SDK 57 iOS builds
- two physical iPhones for camera/microphone and lock-screen testing
- an Apple Developer team for installing development builds on physical devices
- a LiveKit Cloud project and API key
- a Cloudflare account for production Worker deployments

Expo Go cannot run this app because LiveKit requires native WebRTC modules.

## Configure locally

Install dependencies:

```sh
npm install
```

Copy the server template and add the LiveKit key and secret. Never put the secret in an `EXPO_PUBLIC_` variable.

```sh
cp server/.env.example server/.env
```

The configured project URL is:

```text
wss://nappio-9a8qy0x7.livekit.cloud
```

Create the app environment file. For physical devices, use the deployed HTTPS pairing service:

```sh
cp .env.example .env
```

Set `EXPO_PUBLIC_API_BASE_URL` to `https://nappio-pairing-api.tmoreton89.workers.dev`. The local TypeScript server remains useful for API development and automated tests, but release and physical-device builds should use HTTPS.

## Production pairing API

The TestFlight production environment uses:

```text
https://nappio-pairing-api.tmoreton89.workers.dev
```

The Worker stores expiring, single-use pairing records, hashed session-recovery credentials, and distributed rate limits in a SQLite-backed Cloudflare Durable Object. LiveKit credentials are encrypted Worker secrets and are never compiled into the mobile app. Pairing codes expire in five minutes and resumable session records expire within 24 hours.

For local Worker development, copy the existing ignored server environment file and start Wrangler:

```sh
cp server/.env worker/.dev.vars
npm run worker:dev
```

Deploy code and update the two Worker secrets with:

```sh
npm run worker:deploy
npx wrangler secret put LIVEKIT_API_KEY --config worker/wrangler.jsonc
npx wrangler secret put LIVEKIT_API_SECRET --config worker/wrangler.jsonc
```

## Run on two physical iPhones

Start the pairing server in one terminal:

```sh
npm run server
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
```

## Two-phone test checklist

1. Start the Baby Unit and allow camera/microphone access.
2. Confirm the rear-camera preview appears and the app does not let the screen sleep.
3. Enter or scan the displayed code on the Parent Unit.
4. Confirm the Baby Unit says **Parent connected**.
5. Confirm live video and audio reach the Parent Unit.
6. Tap **Audio Only** and verify network video reception stops in the LiveKit session view.
7. Lock the Parent iPhone and listen continuously for at least 30 minutes.
8. With monitoring alerts enabled, make sustained sound near the Baby Unit and verify the locked Parent phone receives a sound alert; then disconnect the Baby Unit and verify the interruption warning appears.
9. Unlock it, tap **Show Video**, and verify video returns.
10. Briefly enable airplane mode, then disable it and verify **Reconnecting** returns to **Monitoring live**.
11. Force-quit and reopen each role, then use **Continue** and verify the same session reconnects.
12. Repeat with Wi-Fi/cellular transitions and Bluetooth connect/disconnect.
13. End monitoring from each role and verify the camera, microphone, audio session, and saved Continue action release.

## Security notes

- `server/.env` and all local `.env` variants are ignored by Git.
- Baby tokens can publish only camera/microphone and cannot subscribe.
- Parent tokens can subscribe and cannot publish.
- Pairing codes are single-use and expire after five minutes.
- Role-specific recovery tokens are stored only as SHA-256 hashes by the Worker and expire within 24 hours.
- E2EE keys are randomly generated per monitoring session and sent only by the pairing API.
- The local server stores pairing records only in memory; restarting it clears them.
- The production Worker stores pairing records and rate limits in one SQLite-backed Durable Object so create and claim operations remain atomic across Worker instances.
- LiveKit token creation completes before a code is claimed, so a transient signing failure does not consume the code.
- The public health endpoint reports storage and LiveKit configuration without exposing credentials.

## Launch material

- [Launch checklist](docs/launch-checklist.md)
- [App Store metadata draft](docs/app-store-metadata.md)
- Privacy policy: [tmoreton.github.io/nappio/#privacy-policy](https://tmoreton.github.io/nappio/#privacy-policy)
- Support: [tmoreton.github.io/nappio/#support](https://tmoreton.github.io/nappio/#support)
