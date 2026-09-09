# App Store privacy worksheet

Use this worksheet when completing **App Privacy** in App Store Connect. It reflects the repository as reviewed on September 8, 2026; confirm the production Cloudflare and LiveKit settings before saving the answers.

## Confirmed behavior

- Nappio has no accounts, ads, cross-app tracking, analytics SDK, or server-side recording.
- Live camera and microphone media is end-to-end encrypted and relayed only for the active monitoring session.
- The pairing service temporarily stores a random pairing code, room identifier, encryption key, hashed recovery credentials, and expiry timestamps. Pairing codes expire after five minutes and session records expire within 24 hours.
- A network address is stored in the rate-limit table and removed after its one-minute rate-limit window.
- Cloudflare Worker observability is enabled. Confirm its production log retention and fields in the Cloudflare dashboard.
- LiveKit may process connection metadata and operational logs. Confirm the production project's retention and support-access settings.

## Recommended App Store Connect answers

- **Tracking:** No.
- **Data used for third-party advertising:** No.
- **Data used for developer advertising or marketing:** No.
- **User content — Photos or Videos / Audio Data:** Do not declare as collected if production confirms that live media is only processed in real time and is not retained beyond the request.
- **Identifiers or Other Data — network address:** Declare conservatively for **App Functionality**, **not linked to the user's identity**, and **not used for tracking**, unless Apple Developer Support confirms that the one-minute abuse-prevention window falls outside the collection definition.
- **Other Data — temporary room and session records:** Declare conservatively for **App Functionality**, **not linked to the user's identity**, and **not used for tracking**.
- **Diagnostics:** Declare only if the confirmed Cloudflare or LiveKit production logging contains diagnostic data retained beyond what is necessary for the live request.

Apple's current definitions and data-type list are maintained in the [App privacy details reference](https://developer.apple.com/app-store/app-privacy-details/). These are disclosure recommendations, not legal advice.

## Before saving the form

- [ ] Confirm Cloudflare Worker log fields and retention.
- [ ] Confirm LiveKit connection-log fields and retention.
- [ ] Confirm there is no recording, egress, analytics, or crash-reporting integration enabled in production.
- [ ] Match the answers to the public privacy policy and the uploaded binary.
- [ ] Revisit the answers whenever a new SDK or production service is added.
