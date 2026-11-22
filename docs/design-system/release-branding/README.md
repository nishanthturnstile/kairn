# Kairn release branding

Use the [approved symbol and wordmark](../logo-finals/shared-cairn/horizontal.svg) across the release. The public release sequence is web and Android, followed by native iPhone distribution. [Distribution plan](../../core/development-and-validation.md#3-distribution)

The Android 17 emulator and iPhone 18 Pro simulator showed the launcher icons and the resting cairn on light and dark cold launch. On both devices, a live Light → Dark → Light switch updated the open Dashboard canvas and wordmark together. The store captures below use isolated development builds with the production identifiers.

## Web

The web shell and story reader declare the [SVG favicon](../../../apps/web/public/brand/favicon.svg), [ICO fallback](../../../apps/web/public/favicon.ico) at 16, 32, 48 and 96 px, and [180 px Apple touch icon](../../../apps/web/public/brand/apple-touch-icon.png). Check the three files on the production HTTPS hostname. Each should return a successful image response. Confirm the tab icon after a fresh session and test the Home Screen shortcut on iPhone.

## Google Play

| Upload | File |
|---|---|
| Store icon | [512 × 512 sRGB RGBA PNG](google-play/app-icon.png) |
| Feature graphic | [1024 × 500 sRGB RGB PNG](google-play/feature-graphic.png), using Kairn’s onboarding ferry illustration and Bricolage Grotesque |
| Phone screenshots | [Dashboard](google-play/01-dashboard.png), [journey detail](google-play/02-journey.png) and [Journeys](google-play/03-journeys.png) at 1080 × 2400 |

Use **Kairn** as the listing title. Draft short description.

> Plan trips with friends and keep every journey in one place.

Draft full description.

> Give each trip a place of its own. Create a journey, add dates, and invite the friends coming along. Open Journeys to see what’s ahead and revisit past trips. Each journey keeps its schedule and people together.

The screenshots use a synthetic account and dated trips in the actual Android development client. Check the set against the signed release candidate and recapture any screen that changes. Play accepts JPEG or opaque RGB PNG with dimensions from 320 to 3840 px and a maximum 2.3:1 aspect ratio for standard phone screenshots. Confirm the required device types in Play Console. [Play listing image requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en)

Build the signed AAB with the intended production package ID and upload key. In the installed candidate, check the [adaptive and themed launcher mark](../../../apps/mobile/assets/brand/adaptive-icon.png) under circular and rounded masks and cold-launch in light and dark system appearance. The APK launcher artwork is configured separately from the Play listing icon. [Adaptive icon guidance](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)

## App Store

The [1024 × 1024 opaque app icon](../../../apps/mobile/assets/brand/app-icon.png) and light and dark launch artwork are packaged through the [native app configuration](../../../apps/mobile/app.json). App Store Connect takes the icon from the uploaded build. When native iPhone distribution opens, confirm the production bundle ID and signing, inspect the Home Screen and cold launch in TestFlight, and check the screenshot set against the signed release candidate. [Apple icon submission](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon/)

The iPhone 18 Pro simulator captures show [Dashboard](app-store/01-dashboard.png), [journey detail](app-store/02-journey.png) and [Journeys](app-store/03-journeys.png) at 1206 × 2622. Confirm the accepted device sizes when submitting. [Apple screenshot requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
