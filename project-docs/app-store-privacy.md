# App Store privacy worksheet

Use this worksheet when completing **App Privacy** in App Store Connect. It reflects the repository as reviewed on September 9, 2026; confirm the production Cloudflare settings before saving the answers.

## Confirmed behavior

- NapNear has no accounts, ads, cross-app tracking, analytics SDK, or server-side recording.
- Live camera and microphone media is WebRTC-encrypted. It travels directly between devices when possible and through Cloudflare TURN only when a relay is needed.
- The pairing service temporarily stores a random pairing code, room identifier, hashed recovery credentials, single-use signaling tickets, and expiry timestamps. Pairing codes expire after five minutes. Active role-scoped session records renew for 30 days at a time and are deleted when ended or expired.
- The app generates a random installation UUID, stores it in iOS Keychain or Android Keystore, and sends it only when creating or joining a room. It is not an Apple advertising identifier. The pairing service retains it in an abuse-prevention counter for approximately one minute.
- Cloudflare also processes network addresses for a one-minute edge abuse-prevention counter.
- Cloudflare Worker observability is enabled. NapNear writes an anonymous `direct` or `relay` connection-path event, without a room, device, or recovery identifier, to estimate relay use.
- Cloudflare Realtime TURN receives a one-way hash-derived room identifier and may process connection metadata and operational logs. Confirm the production account's retention and support-access settings.

## Recommended App Store Connect answers

- **Tracking:** No.
- **Data used for third-party advertising:** No.
- **Data used for developer advertising or marketing:** No.
- **User content — Photos or Videos / Audio Data:** Do not declare as collected if production confirms that live media is only processed in real time and is not retained beyond the request.
- **Identifiers — Device ID:** Declare the random installation UUID for **App Functionality**, **not linked to the user's identity**, and **not used for tracking**.
- **Identifiers or Other Data — network address:** Declare conservatively for **App Functionality**, **not linked to the user's identity**, and **not used for tracking**, unless Apple Developer Support confirms that the one-minute abuse-prevention window falls outside the collection definition.
- **Other Data — temporary room and session records:** Declare conservatively for **App Functionality**, **not linked to the user's identity**, and **not used for tracking**.
- **Diagnostics — Other Diagnostic Data:** Declare the aggregate direct-versus-relay connection event conservatively for **App Functionality**, **not linked to the user's identity**, and **not used for tracking** if Cloudflare retains it beyond the live request.

Apple's current definitions and data-type list are maintained in the [App privacy details reference](https://developer.apple.com/app-store/app-privacy-details/). These are disclosure recommendations, not legal advice.

## Before saving the form

- [ ] Confirm Cloudflare Worker log fields and retention.
- [ ] Confirm Cloudflare Realtime TURN connection-log fields and retention.
- [ ] Confirm there is no recording, egress, analytics, or crash-reporting integration enabled in production.
- [ ] Match the answers to the public privacy policy and the uploaded binary.
- [ ] Revisit the answers whenever a new SDK or production service is added.
