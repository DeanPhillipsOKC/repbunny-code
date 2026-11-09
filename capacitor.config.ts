import type { CapacitorConfig } from '@capacitor/cli'

// Native shell for the iPhone and Android apps (see docs/architecture.md#native-apps).
// Wraps the same Vite build the PWA deploys: `npm run build`, then
// `npx cap sync` copies dist/ into android/ (and ios/ later).
//
// appId is the store build's permanent ID; it can't change once an app
// record exists in App Store Connect or the Play Console (#29). The personal
// Obtainium build (#68) overrides it with a Gradle product flavor
// (app.repbunny.personal), not here.
const config: CapacitorConfig = {
  appId: 'app.repbunny',
  appName: 'RepBunny',
  webDir: 'dist',
  plugins: {
    // Rest timer alerts (#78). The icon is a drawable in android/app/src/main/res.
    LocalNotifications: {
      smallIcon: 'ic_stat_rest',
      iconColor: '#f2879c',
    },
    // Issue #639: the plugin's encryption support (on by default) keeps its
    // secrets under an Android Keystore key. Auto Backup restores the secrets
    // file on a reinstall but never the key, so the plugin failed to load and
    // the app couldn't open its data at all. The app never encrypts a
    // database, so the plugin skips the keystore entirely.
    CapacitorSQLite: {
      androidIsEncryption: false,
      iosIsEncryption: false,
    },
  },
}

export default config
