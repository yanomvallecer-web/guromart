# GuroMart on Google Play

The Android app is a **Trusted Web Activity (TWA)**: a small Android wrapper that opens
guromart.vercel.app full screen in Chrome, with no address bar. Every change to the website
shows up in the app straight away, so the app only needs a new release when its name, icon,
package or web address changes.

## What the website provides

| Piece | Where | Why |
| --- | --- | --- |
| Web app manifest | `src/app/manifest.ts` → `/manifest.webmanifest` | Name, colours and icons the app is built from |
| Icons | `public/icons/`, `src/app/apple-icon.png` | 192 and 512 px launcher icons (also used as maskable) |
| Service worker | `public/sw.js`, registered in `components/site/service-worker-register.tsx` | Shows `public/offline.html` when there's no connection; caches nothing else |
| Digital Asset Links | `src/app/.well-known/assetlinks.json/route.ts` | Proves the app and the site belong together, so no address bar shows |
| App mode | `components/site/android-app.tsx`, `globals.css` | Hides paid checkout inside the app (see below) |

### Paid checkout is hidden inside the app

Google Play requires its own billing for digital goods bought inside an app, and an app may
not point buyers to another way to pay. Lesson plans and worksheets are digital goods, and
the Philippines has no alternative-billing programme yet, so the app hides Add to cart,
Buy now, the cart and Pay buttons. It keeps browsing, free resources, My Library (including
paid resources bought on the website), orders, selling and the seller dashboard.

The app opens `/?app=android`. A small script in the page head remembers that for the
app's own tab (sessionStorage, so it never affects the same phone's Chrome) and sets
`<html data-app="android">`. CSS then hides anything marked `data-web-checkout` and shows
anything marked `data-app-only`. To try it in a normal browser, open
`/?app=android`; close the tab to leave app mode.

## Build settings

Use [PWABuilder](https://www.pwabuilder.com) (in the browser, nothing to install) or
Bubblewrap with these values:

| Setting | Value |
| --- | --- |
| URL | `https://guromart.vercel.app` |
| Package ID | `com.guromart.app` (permanent once published) |
| App name / launcher name | `GuroMart` |
| Start URL | `/?app=android` |
| Theme and navigation colour | `#1a56a8` |
| Background colour | `#ffffff` |
| Display mode | Standalone |
| Version | `1.0.0`, version code `1` (raise the code by 1 for every upload) |
| Signing key | Create new (first time only), then keep it |

PWABuilder's download contains the `.aab` to upload to Play, an `.apk` for installing on a
phone directly, the signing key (`signing.keystore`) and its passwords
(`signing-key-info.txt`). **Back up the key and passwords privately.** With Play App
Signing it is only the upload key, so Google can reset it if it's lost, but that takes days.

## Linking the app to the site

1. In Play Console open **Test and release → App integrity → App signing** and copy the
   **SHA-256 certificate fingerprint** of the *App signing key*. Also copy the *Upload key*
   fingerprint (it matches the `assetlinks.json` in PWABuilder's download); it makes the
   `.apk` from PWABuilder work full screen too.
2. In Vercel (**guromart → Settings → Environment Variables**, Production) add
   `ANDROID_SHA256_CERT_FINGERPRINTS` with both fingerprints separated by a comma.
   Add `ANDROID_PACKAGE_NAME` only if the package ID is not `com.guromart.app`.
3. Redeploy, then open `https://guromart.vercel.app/.well-known/assetlinks.json`: it should
   list the package and both fingerprints. Until then the app shows a thin address bar.

## Custom domain later

The app is tied to `guromart.vercel.app`. Moving to a domain like `guromart.ph` means a new
app release with the new address, and keeping the old address redirecting.
