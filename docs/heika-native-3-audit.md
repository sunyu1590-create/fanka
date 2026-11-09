# HEIKA Native 3.0 implementation audit

## Source baseline

- Website package version at the inspected source commit: `2.40.7` (`package.json`).
- Website source tree baseline: repository commit `4e045e38d1b3c1a2fa72cf0e7b4cb1214d56a2e5` on `codex/native-discovery-from-52`; the project history identifies the 2.40.7 website merge on `main` as `1e9d31df9e5672fe22d027c74afe685920e7150e`.
- Existing Android `android/` module is a Kotlin WebView host. It was intentionally not inherited or edited by the Native 3.0 project.
- Existing `mobile/` project is an Expo/React Native reference, not the Native 3.0 launcher.
- No production keystore or signing configuration was found. The Native 3.0 release variant is therefore unsigned.

## Native route evidence

- `native-android/app/src/main/AndroidManifest.xml` launches `.MainActivity`.
- `MainActivity` directly calls `setContent { HeikaNativeApp(...) }` and never creates a WebView.
- `HeikaNativeApp` starts on Compose `home`; Compose Navigation routes `discovery` to `DiscoveryScreen`.
- `DiscoveryScreen` renders `LazyVerticalStaggeredGrid` with stable cloud IDs. Its data comes from `DiscoveryViewModel` → `HeikaRepository` → existing `moonclean.shop` endpoints.
- The only `WebView` in the new project is `feature/compat/CompatWebScreen.kt`, used for non-migrated screens. This source contains no `addJavascriptInterface`; authentication sync is constrained by AndroidX WebKit's HTTPS origin allowlist.
- `HEIKA_NATIVE` application logs and the `MainActivity` Compose entry make route/build identification possible in a debug device log. `DiscoveryScreen` also logs a Compose renderer marker on entry.

## Known boundaries

- Native discovery, daily cards, account/session storage, settings/about, and the in-app notifications page are implemented.
- Messaging, profile, content detail/comments, search, publishing, and feedback remain controlled website compatibility routes.
- Android notification permission/channel and site notification list are implemented. No Firebase configuration or server device-token/delivery API was found; remote push is not connected.
- No automated release update feed was found; About's update action is intentionally disabled.
- Legal policy text in the website source is marked as not yet available.
- Runtime screenshots, physical device permission tests, Layout Inspector, frame timing, and memory profiling require an Android SDK/emulator/device. The current workspace has no Android SDK and outbound shell downloads are blocked, so the GitHub workflow is the build path.
