# Nappio

Nappio turns two phones into a private baby monitor. The Baby Unit publishes its rear camera and microphone to LiveKit; the Parent Unit watches the encrypted stream or switches to true audio-only mode for locked-screen listening.

This repository contains the Expo SDK 57 app and a minimal TypeScript pairing/token server. Media travels through LiveKit and is never handled or recorded by the pairing server.

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
- request size limits, no-store responses, and per-address pairing rate limits
- automated pairing-store and API tests

## Requirements

- Node.js 22.13 or newer
- Xcode 26.4 or newer for SDK 57 iOS builds
- two physical iPhones for camera/microphone and lock-screen testing
- an Apple Developer team for installing development builds on physical devices
- a LiveKit Cloud project and API key

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

Create the app environment file using the computer's current LAN address so both phones can reach it:

```sh
cp .env.example .env
ipconfig getifaddr en0
```

Set `EXPO_PUBLIC_API_BASE_URL` to `http://<LAN-IP>:8787`. The phones and computer must be on the same local network. Use a deployed HTTPS pairing server before testing across networks or sharing the app outside your trusted LAN.

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
npx expo export --platform web
```

## Two-phone test checklist

1. Start the Baby Unit and allow camera/microphone access.
2. Confirm the rear-camera preview appears and the app does not let the screen sleep.
3. Enter or scan the displayed code on the Parent Unit.
4. Confirm the Baby Unit says **Parent connected**.
5. Confirm live video and audio reach the Parent Unit.
6. Tap **Audio Only** and verify network video reception stops in the LiveKit session view.
7. Lock the Parent iPhone and listen continuously for at least 30 minutes.
8. Unlock it, tap **Show Video**, and verify video returns.
9. Briefly enable airplane mode, then disable it and verify **Reconnecting** returns to **Monitoring live**.
10. Repeat with Wi-Fi/cellular transitions and Bluetooth connect/disconnect.
11. End monitoring from each role and verify the camera, microphone, and audio session release.

## Security notes

- `server/.env` and all local `.env` variants are ignored by Git.
- Baby tokens can publish only camera/microphone and cannot subscribe.
- Parent tokens can subscribe and cannot publish.
- Pairing codes are single-use and expire after five minutes.
- E2EE keys are randomly generated per monitoring session and sent only by the pairing API.
- The local server stores pairing records only in memory; restarting it clears them.
- Do not claim that monitoring is private in production until the deployed HTTPS service and physical-device E2EE behavior have been independently verified.

For production, replace the in-memory pairing store with a shared TTL store, deploy the API over HTTPS, and use distributed rate limiting. Do not deploy the current in-memory server to a multi-instance serverless host.
