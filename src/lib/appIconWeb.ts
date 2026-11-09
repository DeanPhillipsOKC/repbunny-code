import { WebPlugin } from '@capacitor/core'
import type { AppIconPlugin } from './appIcon'

// Issue #145: the browser stand-in for the native app icon switch, used only
// by the e2e suite's browser local mode. It keeps the icon in localStorage,
// outside the repbunny- prefix, because the phone's icon survives Erase all
// data the same way.
const KEY = 'app-icon-web'

export class AppIconWeb extends WebPlugin implements AppIconPlugin {
  async getName() {
    try {
      return { name: localStorage.getItem(KEY) ?? 'classic' }
    } catch {
      return { name: 'classic' }
    }
  }

  async setName({ name }: { name: string }) {
    try {
      localStorage.setItem(KEY, name)
    } catch {
      // Storage blocked: the stand-in just forgets.
    }
  }
}
