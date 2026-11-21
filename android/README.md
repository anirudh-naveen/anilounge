# AniLounge for Android

The Google Play app. Like the iOS app (`ios/`), it is a Capacitor shell that loads the
live site (`capacitor.config.ts`), so most changes ship with a Vercel deploy and need no
Play release. What lives here is the native part:

| Feature | iOS | Android |
| --- | --- | --- |
| Push notifications | APNs (`AppDelegate.swift`) | Firebase Cloud Messaging; one channel per kind (`NotificationChannels.java`) |
| Home screen widgets | WidgetKit (`AniLoungeWidgets/`) | App widgets, small/medium/large (`widget/`) |
| Share to AniLounge | Share extension (`AniLoungeShare/`) | Share target (`share/ShareActivity.java`) |
| Theme app icons | Alternate icons | Launcher activity-aliases, switched in the background (`AppIcons.java`) |
| Rating prompt | StoreKit | Google Play In-App Review (`WidgetBridgePlugin.java`) |
| Links open the app | Universal links | App Links (`AndroidManifest.xml`, `public/.well-known/assetlinks.json`) |
| Calendar (.ics) | In-app browser | Downloaded and opened in the calendar app |
| Back navigation | Swipe | Back button closes sheets, then goes back (`src/utils/nativeApp.ts`) |

`WidgetBridgePlugin.java` is the same `WidgetBridge` plugin as
`ios/App/App/WidgetBridgePlugin.swift`, so `src/utils/nativeApp.ts` drives both.

## Build and run

Needs Android Studio (or the Android SDK) and JDK 21.

```bash
npm run android:sync     # copy capacitor.config.ts and plugins into android/
npm run android:open     # open in Android Studio and press Run
```

To try unreleased site changes in the emulator, point the app at your dev server (the Mac
is `10.0.2.2` from the emulator):

```bash
CAP_SERVER_URL=http://10.0.2.2:5174 CAP_ANDROID_DEBUG=1 npx cap sync android
```

Run `npm run android:sync` again before a release build so it loads the live site.

Icons and splash images come from the iOS asset catalog; after changing those, run
`python3 android/tools/make_icons.py` (needs Pillow).

## One-time setup for Google Play

1. **Firebase (push notifications).** In the Firebase console, add an Android app with
   package `net.anilounge.app` and download `google-services.json` into `android/app/`
   (git-ignored). Then Project settings → Service accounts → Generate new private key, and
   set the backend's `FCM_SERVICE_ACCOUNT` to that JSON (`backend/.env.example`).
   Without `google-services.json` the app builds, but notifications can't be turned on.
2. **Database.** Run `npm run db:schema` in `backend/` before deploying the backend: pushes
   now read `push_devices.platform`.
3. **Upload key.** Create it once and keep it safe (losing it means asking Google to reset it):

   ```bash
   keytool -genkeypair -v -keystore android/anilounge-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Copy `keystore.properties.example` to `keystore.properties` and fill in the passwords.
   Both files are git-ignored.
4. **App Links.** After the first upload, Play Console → Test and release → App integrity →
   App signing shows the app signing key's SHA-256 fingerprint. Put it in
   `public/.well-known/assetlinks.json` (replacing the placeholder) and deploy the site.
5. **Store listing.** Once the app is live, set `VITE_PLAY_STORE_URL` on Vercel to
   `https://play.google.com/store/apps/details?id=net.anilounge.app` so the website's app
   prompt offers Google Play to Android visitors.

Play Console also asks for: the privacy policy URL (`https://www.anilounge.net/privacy`),
a Data safety form (account info, user content, app interactions; push tokens go to
Firebase), content rating, and the account deletion URL (Settings → Privacy & Security on
the site). The app needs an account, so the "App access" form needs a sign-in for
reviewers (the same one given to App Review works).

## Release

Bump `versionCode` (every upload) and `versionName` in `app/build.gradle`, then:

```bash
npm run android:bundle
```

Upload `android/app/build/outputs/bundle/release/app-release.aab` to Play Console.
