# HEIKA Android

React Native Android client for HEIKA. It renders native React Native screens and uses the existing HEIKA production API and Supabase Auth.

## Included in stage one

- Discovery feed and pagination
- Native post detail and comments
- Sign-in and account registration
- Likes and bookmarks
- Profile, own works and saved works overview
- Text and image publishing with client-side image compression
- Android APK build profiles in `eas.json`

## Included in stage two

- Expo Router navigation for native secondary pages
- Private message inbox, user search, direct chats and Supabase Realtime updates
- In-app activity notifications backed by the existing notifications API
- Android notification permission, message channel, and foreground incoming-message alerts with tap-through to the chat
- Creator analytics, weekly missions and reward claiming
- AI writing assistant using the server-side DeepSeek workbench API
- Admin overview, pending post review and keyword-rule controls using server permission checks

The app version is `1.1.0` (Android version code `2`) so it installs over the stage-one APK. Android system alerts work for incoming messages while the app is active and the user has granted notification permission. Background push delivery is not enabled yet: it requires linking the Expo project and configuring Android FCM credentials. The in-app notification center works without those credentials.

## API configuration

The default API endpoint is `https://moonclean.shop`. Override it at build time with `EXPO_PUBLIC_API_BASE_URL` if the production domain changes. The app reads the public Supabase Auth configuration from `/api/client-config`; no service-role key is included in the app.

```sh
npm install
npx expo start
```

## Android build

The `preview` and `production` EAS profiles are configured to produce an APK:

```sh
npx eas-cli build --platform android --profile preview
```

A standalone local Android APK can be generated after installing Android SDK/Gradle prerequisites:

```sh
npx expo prebuild --platform android --non-interactive
cd android && ./gradlew assembleRelease
```
