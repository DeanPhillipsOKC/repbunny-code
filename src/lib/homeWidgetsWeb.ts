import { WebPlugin } from '@capacitor/core'
import type { HomeWidgetsPlugin, WidgetAction } from './homeWidgets'

// Issue #144: the browser stand-in for the native home screen widgets, used
// only by the e2e suite's browser local mode. It keeps the last snapshot in
// sessionStorage, the way the phone keeps it outside the app, and
// simulateTap plays the part of a tap on a widget.
const KEY = 'repbunny-home-widgets-web'

export class HomeWidgetsWeb extends WebPlugin implements Omit<HomeWidgetsPlugin, 'addListener'> {
  async update({ snapshot }: { snapshot: string }) {
    try {
      sessionStorage.setItem(KEY, snapshot)
    } catch {
      // Storage blocked: the stand-in just forgets.
    }
  }

  async getSnapshot() {
    try {
      return { snapshot: sessionStorage.getItem(KEY) }
    } catch {
      return { snapshot: null }
    }
  }

  async simulateTap(action: WidgetAction) {
    this.notifyListeners('widgetAction', action)
  }
}
