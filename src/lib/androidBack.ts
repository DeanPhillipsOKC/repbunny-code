import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import type { Router } from 'vue-router'

// Issue #482: on Android the back gesture used to close or minimize the app
// from any sheet or sub-screen, since only router pages are history entries.
// Back now closes the topmost open dialog first, then goes up one route, and
// leaves the app only from Home. Every sheet already closes on Escape, so
// closing is that same key sent to the topmost dialog (it bubbles to the
// document and window listeners the sheets use). A dialog that ignores Escape,
// such as the first-run unit picker, simply stays: back never exits past it.
export type BackDeps = {
  topDialog: () => Element | null
  routeName: () => string | null | undefined
  hasHistory: () => boolean
  closeDialog: (dialog: Element) => void
  goBack: () => void
  goHome: () => void
  exitApp: () => void
}

export function handleBack(deps: BackDeps): 'dialog' | 'back' | 'home' | 'exit' {
  const dialog = deps.topDialog()
  if (dialog) {
    deps.closeDialog(dialog)
    return 'dialog'
  }
  if (deps.routeName() !== 'home') {
    if (deps.hasHistory()) {
      deps.goBack()
      return 'back'
    }
    deps.goHome()
    return 'home'
  }
  deps.exitApp()
  return 'exit'
}

export function installAndroidBack(router: Router) {
  if (Capacitor.getPlatform() !== 'android') return
  void App.addListener('backButton', () =>
    handleBack({
      topDialog: () => {
        const dialogs = document.querySelectorAll('[role="dialog"]')
        return dialogs.length ? dialogs[dialogs.length - 1] : null
      },
      routeName: () => router.currentRoute.value.name as string | undefined,
      hasHistory: () => typeof window.history.state?.back === 'string',
      closeDialog: (dialog) =>
        dialog.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }),
        ),
      goBack: () => router.back(),
      goHome: () => void router.push('/'),
      exitApp: () => void App.exitApp(),
    }),
  )
}
