# Native 3.0 CloudBase integration

This integration is based on `main` after the CloudBase migration. The Native Android client does not call the retired Vercel deployment or a Supabase Auth/Data API.

## Request flow

- `GET /api/client-config` returns the configured CloudBase auth gateway. The app uses it for CloudBase sign-in and refresh; it does not receive a database key or service credential.
- Registration, identity bootstrap, password changes, and recovery-code reset use the corresponding HEIKA `/api/v1/auth/*` routes.
- Content, profile, publishing, moderation, membership, and notification data use the current authenticated `/api/v1` routes on `https://moonclean.shop`.
- Direct messages use `/api/v1/messages`; the server applies the caller's CloudBase identity and existing `dm_*` database operations.
- Exploration calendar reads use `/api/v1/exploration-calendar`; the server scopes interaction history to the authenticated user and applies the profile timezone.

The existing message tables/RPCs and calendar data are reused from `cloudbase/migrations/`. Two additive migrations add administrator-only CloudBase membership plan fields and a public-read/admin-write bucket for exploration-ad images. Native code calls the same server API boundary used by the CloudBase website rather than accessing data tables directly.

## Account recovery

CloudBase currently uses HEIKA recovery codes for password recovery. The Native login screen presents that supported flow and no longer offers an email OTP flow that the current account service does not provide.

## Build

The Android module is `native-android/`. The repository's Android GitHub Actions workflow runs web tests/typecheck plus Native unit tests, lint, and debug/unsigned-release builds for branch pushes and pull requests. The unsigned release artifact is for inspection; production distribution requires the repository's protected Android signing configuration.
