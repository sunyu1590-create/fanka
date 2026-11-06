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

A local Android build can be generated after installing Android SDK/Gradle prerequisites:

```sh
npx expo prebuild --platform android
cd android && ./gradlew assembleDebug
```
