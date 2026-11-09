# HEIKA Native 3.0

This is an independent Kotlin/Jetpack Compose Android application. The legacy `android/` WebView application and `mobile/` reference project remain unchanged and are not used as the Native 3.0 launcher.

## Current implementation boundary

- **Native Compose:** app launch, theme, floating glass navigation, today card deck, discovery community/AI feeds, notifications list, Android notification permission/channel, settings, account credentials, and app-specific About screen.
- **First-party Web compatibility:** messaging, profile, post detail/comments, search, publishing, and feedback continue to use the existing `moonclean.shop` routes where those flows are not migrated yet. A WebView is created only when one of these routes is opened; it is not the app host or discovery renderer.
- **Backend/data:** existing 2.40.7 APIs and Supabase Auth. Access/refresh credentials are stored encrypted using Android Keystore AES-GCM. The WebView can receive the active session only on the allow-listed first-party origin; session changes are read back through AndroidX WebKit's origin-restricted message listener.
- **Notifications:** the in-app list, read state, server preference, Android 13 permission, and channel are implemented. Repository inspection found no FCM configuration or device-registration/delivery endpoint, so remote system push is explicitly not claimed as connected.
- **About/update:** version comes from the installed package. Update checking is disabled because no reliable release feed exists. The website currently marks legal texts unavailable, which is reflected instead of linking to placeholder policies.

## Data APIs reused

- `GET /api/demo/cards` and `POST /api/demo/cards`: daily candidate IDs and revealed content.
- `GET /api/demo/cards?mode=discover&limit=24`: cursor-paged community discovery, tags/categories, ratings and likes.
- `GET /api/v1/categories?channel=...&kind=...`: community/AI categories and topics.
- `GET /api/v1/ai-space`: AI resources, category, type and sort filters.
- `GET /api/v1/library-state` / `POST /api/v1/library-state`: existing account profile, opened interactions and daily history.
- `GET/POST /api/v1/notifications` and `GET/PATCH /api/v1/settings/notifications`: existing notification list/read state and supported comment preference.
- `GET /api/client-config`: public Supabase URL and anon/publishable key only.

The discovery recommendation ranker mirrors the website's current client-side topic, interest, rating, freshness and diversity scoring on each API page. The home deck retains the site's 50-card deterministic daily candidate ordering, membership allowance, and bounded lucky bonus.

## Build

```bash
cd native-android
./gradlew testDebugUnitTest lintDebug assembleDebug assembleRelease
```

The Android workflow runs on relevant changes, pull requests, and manual dispatch. Debug is installable with the CI debug key. Release output is unsigned for inspection until the existing production signing certificate is supplied through GitHub Secrets; it is not an installable production upgrade package.

Application ID remains `com.heika.community`; package version is `2.3.6` / code `12`. Code 12 advances the checked-in 2.3.6/code 11 configuration. No release signing certificate was found in the repository. A debug APK signed with a CI debug key cannot upgrade an APK signed by the production key.
