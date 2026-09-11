# Contributing to NapNear

Thanks for helping improve NapNear. The project favors a small, dependable monitoring flow over a large feature surface.

## Before opening an issue

- Search existing issues and include the app platform, OS version, network types, and NapNear commit or build version.
- Remove pairing codes, recovery tokens, TURN credentials, identifiable media, and private room details from logs and screenshots.
- Use the private process in [SECURITY.md](SECURITY.md) for anything that could expose a monitoring room or credential.

## Development setup

Use Node.js 22.13 or newer and follow the [versioned Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/). Install the app and Worker dependencies separately:

```sh
npm install
npm --prefix worker install
cp worker/.dev.vars.example worker/.dev.vars
cp .env.example .env
```

Set a unique local `SESSION_SECRET` in `worker/.dev.vars`. TURN is optional for same-network development, but real release testing must cover a TURN-relayed connection. Native WebRTC requires a development build; Expo Go cannot run the monitoring flow.

## Making a change

- Keep UI and configuration changes focused and accessible.
- Treat `src/realtime/protocol.ts` and the Worker WebSocket protocol as one versioned interface. Update both sides and their tests together.
- Do not add accounts, analytics, remote push, persistent media, or new third-party data flows without documenting the privacy and operational impact.
- Never commit `.env`, `worker/.dev.vars`, signing files, device builds, or real credentials.
- Keep official deployment details out of reusable app logic. Fork-specific Expo identifiers can be supplied through the `NAPPIO_*` build variables described in the README.

## Verification

Run these checks before submitting a pull request:

```sh
npm run check
npx expo-doctor
npx expo export --platform web
npm --prefix worker run deploy -- --dry-run
```

Changes affecting media, permissions, background execution, or connectivity also need the relevant cases from [docs/physical-device-testing.md](docs/physical-device-testing.md). State which devices and network combinations you tested in the pull request.

## Pull requests

Explain the user-visible outcome, the important implementation choices, verification performed, and any rollout or compatibility risk. Keep generated native folders out of the pull request unless the change explicitly requires native source changes.

Unless you explicitly state otherwise, a contribution intentionally submitted for inclusion in NapNear is provided under the Apache License 2.0, as described in section 5 of the license.
