# NapNear launch checklist

## Automated and repository checks

- [ ] `npm ci` completes from a clean checkout.
- [ ] `npm --prefix worker ci` completes from a clean checkout.
- [x] `npm run check` passes lint, TypeScript, protocol tests, and Cloudflare-runtime tests on the WebRTC branch.
- [x] `npx expo-doctor` reports every project check passing.
- [x] `npm run site:build` succeeds.
- [x] EAS production build 20 completes for App Store distribution, uploads successfully, and is marked valid and in internal testing by TestFlight.
- [ ] The release build runs correctly on a 13-inch iPad in portrait and landscape, including a resized iPad window.
- [ ] The GitHub repository has an `EXPO_TOKEN` Actions secret scoped to the NapNear Expo project.
- [ ] A push to `main` completes the **Publish NapNear OTA update** workflow and publishes to the `production` channel.
- [ ] A production build downloads a compatible update, applies it after reopening, and never rolls back to an older update.
- [ ] The repository contains `CLOUDFLARE_ACCOUNT_ID`, and the GitHub `production` environment contains a narrowly scoped `CLOUDFLARE_API_TOKEN` secret.
- [ ] The repository contains `CLOUDFLARE_ANALYTICS_TOKEN`, and `TURN_DAILY_EGRESS_WARN_GB` matches the accepted budget.
- [x] The production pairing API health response reports storage, signaling, TURN, and sharded routing configured.
- [x] A production browser probe exchanges synthetic audio, video, and data over both direct (`host/host`) and forced TURN (`relay/relay`) WebRTC connections.
- [ ] GitHub Pages contains the current privacy and support sections.

## Required physical device verification

- [ ] Complete every case in `project-docs/physical-device-testing.md`, including a relayed connection and the one-Baby/three-Parent room.
- [ ] On a fresh install, confirm onboarding appears once; complete or skip it, relaunch, and confirm the role chooser opens directly.
- [ ] Replay the welcome guide from Help & support and confirm Back, Continue, and Choose a role all work.
- [ ] Confirm releasing push-to-talk, backgrounding the Parent app, and disconnecting the Baby Unit all stop the Parent microphone.
- [ ] Confirm backgrounding or locking the Parent does not switch video monitoring to Audio Only, and that video resumes immediately after returning to the app.
- [ ] Confirm each sound-alert sensitivity persists after relaunch and does not repeat within its cooldown.
- [ ] Advance or shorten the test expiry and confirm authenticated use renews each role without re-pairing.
- [ ] Leave both phones running for an overnight soak test while connected to power.
- [ ] After ending a Parent session, confirm only that Parent credential is rejected; after ending the Baby room, confirm every Parent credential is rejected.
- [ ] Repeat the core pair, video, audio, and permission flows with at least one physical iPad.

## App Store Connect decisions that require the developer

- [x] Sync the title, description, keywords, URLs, categories, age rating, and manual-release setting from `store.config.json`.
- [x] Confirm the privacy-policy URL: `https://napnear.com/#privacy-policy`.
- [x] Confirm the support URL: `https://napnear.com/#support`.
- [ ] Complete App Privacy answers using `project-docs/app-store-privacy.md` and the actual Cloudflare logging/retention settings. Do not assume “Data Not Collected” solely because NapNear has no accounts or recording.
- [ ] Review the export-compliance answer for WebRTC encryption. The repository currently declares that it does not use non-exempt encryption; the developer is responsible for confirming that classification.
- [ ] Confirm the camera, microphone, notification, and background-audio descriptions shown by the uploaded build.
- [x] Upload the five `1320 x 2868` iPhone screenshots from `app-store/screenshots/iphone-6.9`.
- [x] Upload the five `2064 x 2752` iPad screenshots from `app-store/screenshots/ipad-13`.
- [ ] Add the multi-device instructions from `project-docs/app-store-metadata.md` to App Review notes.
- [ ] Choose release method, territories, age rating, pricing, and availability.

## Operational readiness

- [ ] Confirm GitHub Actions notifications reach the person responsible for the app.
- [ ] Review the scheduled production-health workflow after its first run.
- [x] Complete the two-stage legacy-compatible/sharded Worker migration in `project-docs/production-runbook.md` and retain the compatibility version as the oldest rollback target.
- [x] Run the bounded local load probe and a 10-room production lifecycle probe without errors or a p95 regression.
- [ ] Review the first scheduled TURN-usage workflow and confirm its failure notification reaches the operator.
- [ ] Review Cloudflare Worker errors and Realtime TURN usage before widening the beta.
- [ ] Decide whether to add a crash-reporting provider. None is enabled, so no crash telemetry is collected today.
- [ ] Keep a previously approved TestFlight build available until the replacement build has passed the physical-device checklist.
- [ ] Ship a new store build whenever native dependencies, permissions, Expo SDK, runtime version, or app version change; OTA updates only cover compatible JavaScript and assets.
