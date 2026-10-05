# Milk Tracker domain migration

The destination is **https://pump.arkaes.dev**. The old domain expires on **November 10, 2026**. Tell users to move before that date; no exact expiration time or timezone has been assumed.

The owner confirmed the new domain is ready on October 5, 2026, and its HTTPS endpoint returns HTTP 200. Migration remains disabled by default until this implementation, Firebase configuration, and the exact old origin have been verified. The public site currently serves the earlier app build, so HTTP availability alone does not verify the new transfer endpoints. An empty source-origin allowlist also prevents migration. There is no automatic redirect or record deletion.

## Configuration

Configure the frontend build and backend Functions parameters consistently. These are public deployment settings, not credentials.

| Frontend build setting | Value / purpose |
| --- | --- |
| `VITE_DOMAIN_MIGRATION_ENABLED` | `false` until the notice should appear; `true` enables the configured campaign. |
| `VITE_DOMAIN_MIGRATION_READY` | `false` until the new app has passed verification; keeps destination actions unavailable. |
| `VITE_DOMAIN_MIGRATION_OLD_ORIGINS` | Defaults to `https://pump.a-naufal.dev`; can override with comma-separated exact HTTPS old origins. An explicit empty value fails closed. |
| `VITE_DOMAIN_MIGRATION_DESTINATION` | Defaults to `https://pump.arkaes.dev`. |
| `VITE_DOMAIN_MIGRATION_RETIREMENT_DATE` | Defaults to the date-only value `2026-11-10`. |
| `VITE_DOMAIN_MIGRATION_CAMPAIGN_ID` | Defaults to `milk-tracker-domain-2026`; match the backend campaign. |

| Backend Functions parameter | Value / purpose |
| --- | --- |
| `GUEST_MIGRATION_ENABLED` | Defaults to `false`; enable only after the destination is ready. |
| `GUEST_MIGRATION_SOURCE_ORIGINS` | Defaults to `https://pump.a-naufal.dev`, matching the frontend allowlist. |
| `GUEST_MIGRATION_DESTINATION_ORIGIN` | Defaults to `https://pump.arkaes.dev`. |
| `GUEST_MIGRATION_CAMPAIGN_ID` | Defaults to `milk-tracker-domain-2026`, matching the frontend. |

Frontend settings are build-time values. Rebuild and deploy to change them. Offline installations retain their cached version until they update online.

## Guest records and recovery

Guest history and settings stay under the original `users/{uid}` path. A private link gives the new app access to that same Firebase UID through a single-use backend grant and custom-token sign-in. Guest users do not need a Google account. Running sessions and unsaved drafts must be saved and synchronized first.

The bootstrap removes the transfer fragment before loading Firebase or App Check. Transfer codes and custom tokens are never persisted in browser storage or written to logs. The backend stores only a digest of the random code, enforces expiry, and serializes redemption. Treat copied transfer links as private until they expire.

Completion requires the new app to read history/settings from Firestore using its signed-in client and receive backend confirmation. A failed read or confirmation can be retried by the already signed-in transfer identity without redeeming the code again. If redemption or sign-in fails before an identity is established, generate a fresh link in the old app. Account switching is explicit; unrelated account records are not merged. Linking is reported complete only after the server confirms the linked profile and the browser has a verified Google session. After completion, old custom-token guest sessions lose access; the linked profile marker cannot be reset or deleted by client writes.

User records are not deleted after migration. Keep the old local state and installation until the user has verified the new app. Configure Firestore TTL on the private grant collection's `expiresAt` field, never on user records. Codes expire after 10 minutes. A claimed grant retains a confirmation receipt for 24 hours so an already signed-in destination can retry; confirmation shortens receipt retention to 1 hour. Firestore TTL removes those temporary grants asynchronously. Code expiry is checked by the server independently of TTL cleanup. Guest cleanup respects active transfers, guest activity, and linked-account status. A transactionally acquired cleanup lease serializes deletion with transfer issuance/confirmation; Firestore rules block guest writes while that lease is active.

## Required validation

Install frontend dependencies with the pinned pnpm version and backend dependencies with `npm ci --prefix functions`. Run `npm run test:unit`, `npm run test:integration`, `npm run build`, `npm run build:functions`, `pnpm exec tsc -b`, and `npm run lint`.

The integration command uses only the `demo-milk-tracker-migration` project and local Auth, Firestore, and Functions emulators. It does not require production credentials. Tests must verify the same UID and exact seeded record IDs/values/settings, unchanged source history, denied access to other users/private grants, concurrent redemption, and recovery. Unit tests cover configuration, synchronization guards, UI states, guest identity, and cleanup. A failed data-preservation or authorization test blocks release.

Verify two separate browser origins and existing Android/iOS installations using a production build. Check initial launch, `/index.html` launch, direct `/migration` navigation, short-lived private links, offline recovery, sign-in, history/settings, installation instructions, and notification permissions. Confirm worker updates wait for saved sessions. Test screenshots with realistic text at mobile and desktop widths.

## Activation and rollback

Keep the same Firebase project on the new domain. Configure Hosting and HTTPS, Firebase Auth authorized domains, reCAPTCHA/App Check allowed domains, and the Functions runtime's ability to sign custom tokens (`iam.serviceAccounts.signBlob` for its signing service account). Guest-transfer callables enforce App Check and exact source/destination origins. Verify these dependencies on the new site before enabling its migration actions.

Deploy the backend, Firestore rules, and disabled frontend first; test the destination. Verify the configured old origin `https://pump.a-naufal.dev`, then enable the backend campaign and frontend readiness/notice settings consistently. Deploy the notice to the old origin while DNS and HTTPS still work, leaving enough overlap before November 10 for existing installations to update. An announcement can appear before destination readiness, but cannot offer a move action.

The reminder functions remain disabled in `functions/src/index.ts`, as before this change. Do not enable them as a side effect of migration. Where reminders are used, the new origin needs its own notification permission and FCM token; the current one-token-per-user model replaces the previous token.

To pause migration, disable backend issuance/redemption and rebuild the frontend with migration disabled. Disabling the campaign does not erase records or move an installation back; cached/offline notices may remain until their next update. Preserve both domains during recovery. Users remove the old home-screen app only after verifying their records on the new one.

## Implementation verification — October 5, 2026

All 106 unit tests (83 frontend, 23 backend), Firebase emulator integration, TypeScript checking, lint, and both production builds passed locally. Chromium checks covered desktop/mobile announcement and standalone dialog layouts, direct guide navigation, offline guide access through the generated worker, and the original `/index.html` launch. Impeccable was installed and used for the interface review. The frontend build retains existing Firebase import/chunk-size warnings. No production services were deployed or migration flags enabled.

Real Android/iOS installation/update behavior, genuine Google popup linking, production App Check/signing/TTL configuration, and acceptance on the configured old and new HTTPS origins must be verified before activation.
