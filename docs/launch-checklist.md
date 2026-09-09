# Nappio launch checklist

## Automated and repository checks

- [ ] `npm ci` completes from a clean checkout.
- [ ] `npm --prefix worker ci` completes from a clean checkout.
- [x] `npm run check` passes lint, TypeScript, local API tests, and Cloudflare-runtime tests.
- [x] `npx expo-doctor` reports every project check passing.
- [x] `EXPO_WEB_BASE_URL=/nappio npx expo export --platform web` succeeds.
- [x] EAS production build 18 completes for App Store distribution, uploads successfully, and is marked valid by App Store Connect.
- [ ] The release build runs correctly on a 13-inch iPad in portrait and landscape, including a resized iPad window.
- [ ] The GitHub repository has an `EXPO_TOKEN` Actions secret scoped to the Nappio Expo project.
- [ ] A push to `main` completes the **Publish Nappio OTA update** workflow and publishes to the `production` channel.
- [ ] A production build downloads a compatible update, applies it after reopening, and never rolls back to an older update.
- [x] The production pairing API health response reports storage and LiveKit configured.
- [ ] GitHub Pages contains the current privacy and support sections.

## Required physical device verification

- [ ] On a fresh install, confirm onboarding appears once; complete or skip it, relaunch, and confirm the role chooser opens directly.
- [ ] Replay the welcome guide from Help & support and confirm Back, Continue, and Choose a role all work.
- [ ] Pair by typed code and by QR code; while the invite is active, join from a second Parent device and confirm both sessions can resume independently.
- [ ] Confirm the Baby Unit shows the correct connected-parent count while each Parent device joins and leaves.
- [ ] Confirm Baby Unit camera and microphone indicators match active monitoring.
- [ ] Confirm Parent Unit audio/video and Audio Only transitions.
- [ ] Hold push-to-talk on each Parent device and confirm the Baby Unit plays clear audio only while the control is held.
- [ ] Confirm releasing push-to-talk, backgrounding the Parent app, and disconnecting the Baby Unit all stop the Parent microphone.
- [ ] On iOS, start Picture in Picture and confirm live video remains visible over another app.
- [ ] Lock the Parent phone for at least 30 minutes and confirm uninterrupted audio.
- [ ] With monitoring alerts enabled, confirm the Test action produces an audible time-sensitive notification and each sensitivity choice persists after relaunch.
- [ ] With the Parent phone locked, make sustained sound near the Baby Unit and confirm a single audible notification appears without repeated alerts for at least 60 seconds.
- [ ] Confirm Baby Unit battery, charging, and freshness status update; then verify the unplugged and low-battery alerts.
- [ ] Disconnect the Baby Unit while the Parent phone is locked and confirm an interruption notification appears.
- [ ] Move the Parent phone between Wi-Fi and cellular and confirm reconnection.
- [ ] Disconnect and reconnect Bluetooth audio during monitoring.
- [ ] Force-quit and reopen each role; use Continue and confirm the session resumes.
- [ ] Leave both phones running for an overnight soak test while connected to power.
- [ ] End each role and confirm camera, microphone, audio, and the local saved session are released.
- [ ] Repeat the core pair, video, audio, and permission flows with at least one physical iPad.

## App Store Connect decisions that require the developer

- [x] Sync the title, description, keywords, URLs, categories, age rating, and manual-release setting from `store.config.json`.
- [x] Confirm the privacy-policy URL: `https://tmoreton.github.io/nappio/#privacy-policy`.
- [x] Confirm the support URL: `https://tmoreton.github.io/nappio/#support`.
- [ ] Complete App Privacy answers using `docs/app-store-privacy.md` and the actual Cloudflare and LiveKit logging/retention settings. Do not assume “Data Not Collected” solely because Nappio has no accounts or recording.
- [ ] Review the export-compliance answer for LiveKit WebRTC and end-to-end encryption. The repository currently declares that it does not use non-exempt encryption; the developer is responsible for confirming that classification.
- [ ] Confirm the camera, microphone, notification, and background-audio descriptions shown by the uploaded build.
- [x] Upload the five `1320 x 2868` iPhone screenshots from `app-store/screenshots/iphone-6.9`.
- [x] Upload the five `2064 x 2752` iPad screenshots from `app-store/screenshots/ipad-13`.
- [ ] Add the multi-device instructions from `docs/app-store-metadata.md` to App Review notes.
- [ ] Choose release method, territories, age rating, pricing, and availability.

## Operational readiness

- [ ] Confirm GitHub Actions notifications reach the person responsible for the app.
- [ ] Review the scheduled production-health workflow after its first run.
- [ ] Review Cloudflare Worker errors and LiveKit project usage before widening the beta.
- [ ] Decide whether to add a crash-reporting provider. None is enabled, so no crash telemetry is collected today.
- [ ] Keep a previously approved TestFlight build available until the replacement build has passed the physical-device checklist.
- [ ] Ship a new store build whenever native dependencies, permissions, Expo SDK, runtime version, or app version change; OTA updates only cover compatible JavaScript and assets.
