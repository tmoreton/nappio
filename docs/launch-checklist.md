# Nappio launch checklist

## Automated and repository checks

- [ ] `npm ci` completes from a clean checkout.
- [ ] `npm --prefix worker ci` completes from a clean checkout.
- [ ] `npm run check` passes lint, TypeScript, local API tests, and Cloudflare-runtime tests.
- [ ] `npx expo-doctor` reports every project check passing.
- [ ] `EXPO_WEB_BASE_URL=/nappio npx expo export --platform web` succeeds.
- [ ] The production pairing API health response reports storage and LiveKit configured.
- [ ] GitHub Pages contains the current privacy and support sections.

## Required physical two-iPhone verification

- [ ] Pair by typed code and by QR code.
- [ ] Confirm Baby Unit camera and microphone indicators match active monitoring.
- [ ] Confirm Parent Unit audio/video and Audio Only transitions.
- [ ] Lock the Parent phone for at least 30 minutes and confirm uninterrupted audio.
- [ ] Disconnect the Baby Unit while the Parent phone is locked and confirm an interruption notification appears.
- [ ] Move the Parent phone between Wi-Fi and cellular and confirm reconnection.
- [ ] Disconnect and reconnect Bluetooth audio during monitoring.
- [ ] Force-quit and reopen each role; use Continue and confirm the session resumes.
- [ ] Leave both phones running for an overnight soak test while connected to power.
- [ ] End each role and confirm camera, microphone, audio, and the local saved session are released.

## App Store Connect decisions that require the developer

- [ ] Confirm the privacy-policy URL: `https://tmoreton.github.io/nappio/#privacy-policy`.
- [ ] Confirm the support URL: `https://tmoreton.github.io/nappio/#support`.
- [ ] Complete App Privacy answers against the actual Cloudflare and LiveKit logging/retention settings. Do not assume “Data Not Collected” solely because Nappio has no accounts or recording.
- [ ] Review the export-compliance answer for LiveKit WebRTC and end-to-end encryption. The repository currently declares that it does not use non-exempt encryption; the developer is responsible for confirming that classification.
- [ ] Confirm the camera, microphone, notification, and background-audio descriptions shown by the uploaded build.
- [ ] Add final App Store screenshots captured from the release build on supported iPhone sizes.
- [ ] Add the two-device instructions from `docs/app-store-metadata.md` to App Review notes.
- [ ] Choose release method, territories, age rating, pricing, and availability.

## Operational readiness

- [ ] Confirm GitHub Actions notifications reach the person responsible for the app.
- [ ] Review the scheduled production-health workflow after its first run.
- [ ] Review Cloudflare Worker errors and LiveKit project usage before widening the beta.
- [ ] Decide whether to add a crash-reporting provider. None is enabled, so no crash telemetry is collected today.
- [ ] Keep a previously approved TestFlight build available until the replacement build has passed the physical-device checklist.
