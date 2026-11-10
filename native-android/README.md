# HEIKA Native 3.0

Native 3.0 is the Kotlin and Jetpack Compose Android application in this directory. It starts directly in the native navigation graph; the legacy `android/` WebView app remains a separate reference project and is not packaged or launched by this application.

## Native application boundary

- Compose owns launch, navigation, the glass bottom bar, home card deck, community and AI discovery, post details and comments, search, account login and recovery, profile and drafts, direct messages, notifications, publishing, settings, membership preview, feedback, and About.
- Native destinations are typed in `feature/navigation/DestinationResolver.kt`. Content, user, and conversation routes retain their business identifiers; invalid targets show a native error screen instead of falling back to the website home.
- The Native 3.0 module contains no WebView host or JavaScript bridge. The website remains the source of existing business APIs, account records, content, and moderation rules.
- Session credentials are held in the existing Android Keystore-backed encrypted store. API requests use the website's existing authenticated routes and the public Supabase Auth configuration endpoint; no service-role key is packaged in the app.

## Existing backend integration

- Home and community discovery reuse the 2.40.7 card, category, rating, interaction, and media APIs. The two-column discovery list, paging, and bounded Coil memory/disk cache remain in place.
- AI discovery reuses `/api/v1/ai-space` and the current category and resource data.
- Detail, comments, rating, likes, bookmarks, creator follows, profiles, search, notification history, preferences, and progression reuse existing `/api/v1` routes.
- Publishing uses the existing draft, media upload, topic validation, and moderation submission behavior. Draft media references are restored through the authenticated library-state API.
- Direct messages use the existing `dm_inbox_summary`, `open_dm`, and `send_dm` database functions, with RLS and existing read-receipt records. The additive `/api/v1/messages` route is the narrow authenticated HTTP adapter used by the native UI.
- Membership is display-only because the website has no active checkout or support transaction. The UI clearly labels plan values as a preview and does not fake purchases or entitlement changes.
- Android permission state, notification channel, in-app notification center, read synchronization, and foreground notice UI are native. Repository inspection found no configured FCM credentials, device registration endpoint, or server delivery pipeline; remote system push is not claimed as connected.

## Version and build

- Application ID: `com.heika.community`
- App version: `2.3.6` (`versionCode` 13 in the checked-in Gradle config); website version `2.40.7` is independent.
- Build from this directory with `./gradlew testDebugUnitTest lintDebug assembleDebug assembleRelease`.
- The HEIKA Native 3.0 Actions workflow runs Android checks and uploads versioned APK artifacts. Debug is signed with the CI debug key. Release output remains unsigned until the production signing certificate is supplied through GitHub Secrets; it is not a production upgrade package.
