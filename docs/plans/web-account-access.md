# Web account access and sign-out

## Design and entry points

The private workspace and direct Story requests require a verified session. Signed-out visitors can sign in, create an account, verify email, resend verification or reset a password. Guest Story access belongs to the publication workstream.

The signed-out shell uses a full-width header and a centered two-column composition. The wordmark combines the Fold mark and Kairn name. A framed [Konkan ferry illustration](../../apps/web/src/assets/konkan-ferry.webp) sits beside the task at desktop widths. Narrow screens start at the task and skip the artwork request. The appearance menu offers System, Light, Dark and Outdoor throughout.

Use the shared authentication heading and one primary action per step. Email and password controls have visible labels and at least 44 px targets. Passwords start masked with a trailing visibility control. Keep the typed email when switching modes in the same visit. Focus moves to the new screen heading after navigating or submitting into a new state. The wordmark opens Sign in for signed-out visitors and Dashboard for verified accounts. Accounts with unfinished setup resume at their saved checkpoint.

The signed-in Account screen puts the editable name and verified email in **Profile**. **Preferences** groups invitation search and the four appearance choices used by the workspace account menu. **Signed-in devices** places **Sign out** with the current session. Each other session shows when it started, and **Revoke device** opens a confirmation with that time. Cancelling returns keyboard focus to the initiating action. Confirming returns focus to the devices heading and reports the result. The panels stack in reading order on narrow screens. [Account settings](../../apps/web/src/components/account/settings.tsx) · [Browser checks](../../tests/web/identity.playwright.ts)

Web and native send the account shown on-screen with device-list and revocation requests. The server compares it with the active session before returning devices or revoking a session. A stale sign-in directs the user to sign out and sign in again. A successful revocation keeps its receipt, while **Check confirmation** reloads the current recovery status. On web, keyboard focus stays on the profile and invitation-search controls through retries. [Device endpoints](../../packages/backend/src/modules/identity/auth.ts) · [Identity regression](../../tests/integration/identity.test.ts)

| Entry or action | What the person sees | Data and routing |
| --- | --- | --- |
| Open Kairn signed out | **Sign in** with email, password, recovery and account creation. A failed attempt gives an inline message. | An allowlisted destination stays bound to the authentication handoff. |
| Create an account | **Create account**, then **Check your email** with the address, resend action and a way to correct the address. | Registration uses the identity service and mail queue. The display name is reused in onboarding. |
| Attempt sign-in before verification | An inline explanation and a **Resend verification** action with the typed email carried forward. | Resend displays a neutral inbox confirmation for any address. |
| Follow a verification link | **Sign in** with a verified message, or **Verification link unavailable** with actions to resend and return to sign-in. | The fixed Account callback handles verification and preserves legitimate invitation context. |
| Request a password reset | **Reset password** with one email field and **Send reset link**, followed by a neutral inbox confirmation. | The result does not disclose whether the address has an account. |
| Open a password reset link | **Set a new password** with the password rule and a note about signing out devices. An invalid or used link opens **Reset link unavailable** with a fresh-link action. | The initial session check settles before the form retains the token in memory and removes it from the visible URL. |
| Save a new password | **Password changed**, followed by a sign-in action. Pending recovery confirmation remains visible, including when the browser is still signed in to a different account. | The identity service revokes existing sessions as part of reset. |
| Sign in successfully | The first unfinished onboarding step, Dashboard, or the intended destination. | Return context binds to the verified account. |
| Session check fails | **Account access unavailable** with **Try again**. | Retry checks the session before any workspace is mounted. |
| Sign out from Account or the workspace menu | **Signing out**, then **Sign in** with a short receipt after the session ends. If the server still sees the session or cannot confirm it, explain the failure and keep a retry available. | Dispose the account cache, abort protected requests and recheck the server session. A session refresh cannot discard an explicit sign-out. |
| Open a direct Story URL | Sign-in without a verified session, setup for accounts still in onboarding, and the generic Story response for other verified accounts. | The server checks the verified session and onboarding checkpoint before rendering HTML. |

[Authentication shell](../../apps/web/src/components/auth/layout.tsx) · [Authentication form and inbox states](../../apps/web/src/components/auth/form.tsx) · [Password reset route](../../apps/web/src/routes/account_.reset.tsx) · [Onboarding and handoff](first-run-onboarding-and-dashboard.md#web-implementation)

## Local origin

Use [the local app through Caddy](http://127.0.0.1:58080/account) for authenticated flows. The browser origin must match the running server’s `BETTER_AUTH_URL`. The direct preview on port `58082` may read a cookie on the same hostname, but a credentialed write from that origin is rejected.

## Verification

The browser checks cover the recovery screen inventory, keyboard focus on state changes, token removal, the 320 CSS px layout at 200% text, and the appearance menu. The service-backed identity suite handles live registration, email verification, cross-tab sign-out, device revocation and password reset, then signs in with the replacement password. [Recovery checks](../../tests/web/auth.playwright.ts) · [Browser account flow](../../tests/web/identity.playwright.ts) · [Appearance checks](../../tests/web/reader.playwright.ts)

## Illustration provenance

Created with the built-in ImageGen tool and compressed to WebP for the web bundle. It depicts an imagined crossing and serves as decorative artwork.

> Create a single portrait 4:5 raster editorial illustration for the visual half of Kairn, a private travel journal web app. This is illustration artwork only, no interface, no lettering or numbers or labels, no frame, no logo. A close shore-level view along a quiet Konkan coast estuary, a small warm ivory and ochre passenger ferry in the middle distance heading left-to-right, a delicate pale wake on dark teal water, one richly forested headland on the right and hazy layered coastal hills upper left. A restrained warm early morning sunlight, soft mineral cream sky, deep pine, ink teal, blue sage and warm sand. An artist-made modern travel-book cover, fine dry-brush gouache, subtle textured pigment, confident natural shapes, carefully observed landscape and modest atmospheric perspective. A little warm sienna material accent on the ferry. Soft light with rich dark foreground. Composition fully bleeds, main ferry roughly centered 55 percent down, ample scene above and below, strong recognizable coastal silhouette. Avoid stock vector aesthetic, gradient blobs, topographic graphics, busy collage, exaggerated cartoony proportions or photorealism. Keep it calm, tactile, and specific to western India's coast.

## Native sign-in

iPhone and Android share the Fold entry frame with first-run setup. The Kairn wordmark and a compact ferry crop introduce Sign in. The form scrolls above the native keyboard, focuses invalid fields and omits the decorative crop at larger text sizes. Passwords start masked and the visibility control sits inside the field. **Forgot password?** opens an email-only form. Both inbox confirmations show the entered address and let the person correct it. Registration and unverified sign-in also offer **Resend verification email**. The email links open the canonical web verification and password-reset screens. Return to the app to sign in. Appearance remains in signed-in Account. [Native account access](../../apps/mobile/src/components/account-access.tsx) · [Entry frame](../../apps/mobile/src/components/account-entry.tsx)

The iPhone 17 Simulator passed password visibility, reset-link delivery, verified sign-in, signed-in Appearance, and return to the redesigned sign-in screen. The Android 17 Emulator passed password visibility, system Back, registration, contextual resend, verification, sign-in, and 200% text. The iPhone layout was also inspected at its largest Dynamic Type setting. Workspace checks, 62 unit tests, and both native builds passed.

## Native signed-in Account

iPhone and Android use the native navigation header and stack Profile, Preferences and Signed-in devices on phones. Preferences uses a native switch for invitation search and a Fold sheet for Appearance. Device revocation opens a confirmation sheet with the session time. Sign out remains available when the device list is unavailable. Account retains the design system link and the setup-resume action. [Native Account](../../apps/mobile/src/components/account/settings.tsx) · [Device management](../../apps/mobile/src/components/account/devices.tsx)

The iPhone 17 Simulator and Android API 37 emulator exercised the redesign with verified accounts and multiple sessions on an isolated local backend. Both saved a display name, revoked another session and changed appearance. The iPhone passed the largest Dynamic Type setting and Android passed 200% text. Both returned to Sign in after sign-out. Android also verified that Sign in explains when only the local sign-out could be confirmed. Workspace checks, 62 unit tests, and both native bundles passed.
