import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { installAndroidBack } from './lib/androidBack'
import { installActionTrail } from './lib/actionTrail'
import { installErrorHandlers } from './lib/errorLog'
import { installTheme } from './lib/theme'
import { lockNativeViewport } from './lib/nativeViewport'
import { loadAppIcon } from './lib/appIcon'
import { refreshPremiumEntitlement } from './lib/premium'
import { ensureRestAlertChannels } from './lib/restAlert'
import { checkLocalData } from './lib/localRecovery'
import './style.css'

document.title = `RepBunny ${__APP_VERSION__}`

// Issue #825: no pinch, double-tap, or focus zoom in the native apps.
lockNativeViewport()

// Issues #107, #118: the theme and Mascot setting, applied to <html>.
installTheme()

async function start() {
  // Issue #431: the on-device data is checked before anything mounts. If it
  // can't open, the recovery screen shows instead of the app.
  const recovery = await checkLocalData()
  if (recovery) {
    const { default: RecoveryScreen } = await import('./components/RecoveryScreen.vue')
    const screen = createApp(RecoveryScreen, { reason: recovery })
    installErrorHandlers(screen)
    screen.mount('#app')
    return
  }

  const app = createApp(App)
  // Issue #83: Vue, window, and unhandled-rejection errors go to client_errors.
  installErrorHandlers(app)
  // Issue #234: the screens and taps a bug report shows before an error.
  installActionTrail(router)
  // Issue #482: Android back closes sheets and steps up a level.
  installAndroidBack(router)
  // Issue #640: the rest-over alert's per-chime channels (Android only).
  void ensureRestAlertChannels()
  app.use(createPinia()).use(router).mount('#app')
  // Issue #105: quietly re-check Premium with the App Store; never awaited.
  void refreshPremiumEntitlement()
  // Issue #861: reads the home-screen icon, moving a retired one.
  void loadAppIcon()
}

void start()
