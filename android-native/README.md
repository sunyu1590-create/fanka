# HEIKA Native 3.0

Native 3.0 is the Kotlin and Jetpack Compose Android application in this directory. It starts directly in the native navigation graph; the legacy `android/` WebView app remains a separate reference project and is not packaged or launched by this application.

## Native application boundary

- Compose owns launch, navigation, the glass bottom bar, home card deck, community and AI discovery, post details and comments, search, account login and recovery, profile and drafts, direct messages, notifications, publishing, settings, membership preview, feedback, and About.
- Native destinations are typed in `feature/navigation/DestinationResolver.kt`. Content, user, and conversation routes retain their business identifiers; invalid targets show a native error screen instead of falling back to the website home.
- The Native 3.0 module contains no WebView host or JavaScript bridge. The website remains the source of existing business APIs, account records, content, and moderation rules.
- Session credentials are held in the Android Keystore-backed encrypted store. Login and token refresh use the CloudBase auth gateway provided by `/api/client-config`; registration, account identity mapping, recovery-code reset, and app data use the authenticated HEIKA `/api/v1` routes. No database key or service credential is packaged in the app.

## Existing backend integration

- Home and community discovery use the current HEIKA card, category, rating, interaction, and media APIs served by CloudBase. The two-column discovery list, paging, and bounded Coil memory/disk cache remain in place.
- AI discovery reuses `/api/v1/ai-space` and the current category and resource data.
- Detail, comments, rating, likes, bookmarks, creator follows, profiles, search, notification history, preferences, and progression reuse existing `/api/v1` routes.
- Publishing uses the existing draft, media upload, topic validation, and moderation submission behavior. Draft media references are restored through the authenticated library-state API.
- Direct messages use the signed-in user's JWT with `/api/v1/messages`; the CloudBase-backed route applies existing participant checks and `dm_inbox_summary`, `open_dm`, and `send_dm` operations.
- Exploration calendar reads use `/api/v1/exploration-calendar`; interaction history is queried server-side for the authenticated user and profile timezone.
- Membership status, plans, redemption, and admin tools use the current HEIKA membership APIs. The Native client does not create a separate entitlement store.
- Android permission state, notification channel, in-app notification center, read synchronization, and foreground notice UI are native. Repository inspection found no configured FCM credentials, device registration endpoint, or server delivery pipeline; remote system push is not claimed as connected.

## Version and build

- Application ID: `com.heika.community`
- App version: `2.12.0` (`versionCode` 66). `android-native/app/build.gradle.kts` is the single source of truth; if this line and the Gradle file disagree, the Gradle file wins. Website version is tracked separately in `package.json`.
- Build from this directory with `./gradlew testDebugUnitTest lintDebug assembleDebug assembleRelease`.
- The main Android APK Actions workflow runs web checks, Native Android lint and unit tests, then uploads versioned APK artifacts. Debug is signed with the CI debug key. Release output remains unsigned until the production signing certificate is supplied through GitHub Secrets; it is not a production upgrade package.
