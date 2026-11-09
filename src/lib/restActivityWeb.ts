import { WebPlugin } from '@capacitor/core'
import type { RestActivityPlugin, RestLiveStart } from './restLive'
import { addRestTime, skipRest, type NativeRest } from './restLiveState'

// Issue #143: the browser stand-in for the native lock-screen timer, used
// only by the e2e suite's browser local mode. It keeps the rest in
// sessionStorage, which outlives a reload the way the native copy outlives
// the app being killed, and simulateAction plays the part of the lock
// screen's +15s / Skip buttons. simulateLocked and getTestState stand in for
// a locked phone and report what the app asked for (#166).
const KEY = 'repbunny-rest-activity-web'

function load(): NativeRest | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as NativeRest) : null
  } catch {
    return null
  }
}

function save(rest: NativeRest | null) {
  try {
    if (rest) sessionStorage.setItem(KEY, JSON.stringify(rest))
    else sessionStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the stand-in just forgets, like a cleared phone.
  }
}

export class RestActivityWeb extends WebPlugin implements Omit<RestActivityPlugin, 'addListener'> {
  private showWhenLocked = false
  private locked = false
  private settingsOpened = 0
  private settingsFail = false

  async start(options: RestLiveStart) {
    const { id, workoutId, exerciseName, endsAt, totalSeconds } = options
    save({ id, workoutId, exerciseName, endsAt, totalSeconds, status: 'running' })
  }

  async end() {
    save(null)
  }

  async getState() {
    return { rest: load() }
  }

  async setShowWhenLocked({ enabled }: { enabled: boolean }) {
    this.showWhenLocked = enabled
  }

  // A locked phone's unlock prompt, cancelled.
  async requestUnlock() {
    return { unlocked: !this.locked }
  }

  async openNotificationSettings() {
    if (this.settingsFail) throw new Error('Settings can\'t be opened')
    this.settingsOpened += 1
  }

  // Plays an iPhone that can't open Settings (#832).
  async simulateSettingsFail({ fail }: { fail: boolean }) {
    this.settingsFail = fail
  }

  async simulateLocked({ locked }: { locked: boolean }) {
    this.locked = locked
  }

  async getTestState() {
    return { showWhenLocked: this.showWhenLocked, settingsOpened: this.settingsOpened }
  }

  async simulateAction({ action }: { action: 'add' | 'skip' }) {
    const rest = load()
    if (!rest) return
    save(action === 'add' ? addRestTime(rest, 15, Date.now()) : skipRest(rest))
    this.notifyListeners('restAction', { action })
  }
}
