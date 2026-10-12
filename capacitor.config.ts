import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iOS app shell. The app loads the live site, so every Vercel deploy reaches the app
 * without an App Store release; `ios-shell/` only holds the offline fallback page.
 */
const config: CapacitorConfig = {
  // Apple Team GH4YAT565S; public/.well-known/apple-app-site-association uses it too.
  appId: 'net.anilounge.app',
  appName: 'AniLounge',
  webDir: 'ios-shell',
  backgroundColor: '#0f1726',
  server: {
    // `CAP_SERVER_URL=http://localhost:5174 npx cap sync ios` tries unreleased changes.
    url: process.env.CAP_SERVER_URL || 'https://www.anilounge.net',
    cleartext: Boolean(process.env.CAP_SERVER_URL?.startsWith('http://')),
    // Account connections approve on these sites and redirect back to /connections;
    // keeping them in the app view stops the return from landing in Safari.
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
  plugins: {
    // Show pushes as banners while the app is open, too.
    PushNotifications: {
      presentationOptions: ['banner', 'list', 'sound'],
    },
    SplashScreen: {
      launchShowDuration: 8000, // the site hides it sooner once it renders (utils/nativeApp.ts)
      backgroundColor: '#0f1726',
    },
  },
}

export default config
