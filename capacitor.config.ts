import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iOS and Android app shell. The apps load the live site, so every Vercel deploy reaches
 * them without an App Store or Google Play release; `ios-shell/` only holds the offline
 * fallback page (both apps use it).
 */
const config: CapacitorConfig = {
  // Apple Team GH4YAT565S; public/.well-known/apple-app-site-association uses it too.
  appId: 'net.anilounge.app',
  appName: 'AniLounge',
  webDir: 'ios-shell',
  backgroundColor: '#0f1726',
  server: {
    // `CAP_SERVER_URL=http://localhost:5174 npx cap sync ios` (or `android`; from the
    // Android emulator the Mac is http://10.0.2.2:5174) tries unreleased changes.
    url: process.env.CAP_SERVER_URL || 'https://www.anilounge.net',
    cleartext: Boolean(process.env.CAP_SERVER_URL?.startsWith('http://')),
    // Account connections approve on these sites and redirect back to /connections;
    // keeping them in the app view stops the return from landing in the browser.
    allowNavigation: [
      'anilounge.net',
      'www.anilounge.net',
      'anilist.co',
      'myanimelist.net',
      'www.themoviedb.org',
    ],
    errorPath: 'offline.html',
  },
  ios: {
    contentInset: 'never',
    scheme: 'AniLounge',
  },
  android: {
    // Release builds can't be inspected from Chrome's devtools.
    webContentsDebuggingEnabled: process.env.CAP_ANDROID_DEBUG === '1',
  },
  plugins: {
    // Show pushes as banners while the app is open, too (Android reads it as well).
    PushNotifications: {
      presentationOptions: ['banner', 'list', 'sound'],
    },
    SplashScreen: {
      launchShowDuration: 8000, // the site hides it sooner once it renders (utils/nativeApp.ts)
      backgroundColor: '#0f1726',
    },
    // Android draws the site under the status and navigation bars, like iOS, and hands it
    // their heights as --safe-area-inset-* (src/assets/styles/global.css). Every theme's
    // navbar is dark, so the bar icons stay light.
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
