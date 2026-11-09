<script setup lang="ts">
import { currentVersionLabel } from '../lib/storeVersion'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { deliveredTitle, NATIVE_SAVE_HINT } from '../lib/deliveredTitle'
import { useRouter } from 'vue-router'
import { backupFileName, buildBackup, buildMeasurementsCsv, buildSetsCsv, csvFileName, measurementsCsvFileName, deliverFile, parseBackup, resetMyData, type BackupFile, type BackupPart } from '../lib/backup'
import { repos } from '../data'
import { accountSheetStartView, bugReportFocus } from '../lib/accountSheet'
import { useKeyboardViewport } from '../lib/keyboardViewport'
import { PREMIUM_INCLUDES, isPremium } from '../lib/premium'
import { refetchAccountData } from '../lib/refetchAccountData'
import { eraseAllData } from '../lib/eraseAllData'
import { exactRestAlertsAllowed, openExactRestAlertSetting, requestRestAlertPermission, restAlertPermission, type RestAlertPermission } from '../lib/restAlert'
import { openRestAlertSettings, REST_ALERT_DIRECTIONS, restSettingsFailed } from '../lib/restLive'
import type { WeightUnit } from '../lib/types'
import { activeTheme, outfitLabel, themeLabel } from '../lib/theme'
import { setWhatsNewBannerOn, whatsNewBannerOn, whatsNewUnread } from '../lib/whatsNew'
import { milestoneMomentsOn, setMilestoneMomentsOn } from '../lib/milestones'
import { recordCelebrations, setRecordCelebrations, type RecordCelebrations } from '../lib/recordCelebrations'
import { useProfileStore } from '../stores/profile'
import { matchesConfirmWord } from '../lib/confirmWord'
import { useWorkoutsStore } from '../stores/workouts'
import AboutLinkRows from './AboutLinkRows.vue'
import BackupOptions from './BackupOptions.vue'
import BugReportSheet from './BugReportSheet.vue'
import FeatureRequestSheet from './FeatureRequestSheet.vue'
import ImportHistory from './ImportHistory.vue'
import LiftingBasics from './LiftingBasics.vue'
import PremiumUnlockActions from './PremiumUnlockActions.vue'
import RestoreBackup from './RestoreBackup.vue'
import RestorePoints from './RestorePoints.vue'
import AutoCopySheet from './AutoCopySheet.vue'
import AutoCopyRow from './AutoCopyRow.vue'
import YourCopies from './YourCopies.vue'
import SetupReplayRows from './SetupReplayRows.vue'
import RatingAskRow from './RatingAskRow.vue'
import StrengthSexPicker from './StrengthSexPicker.vue'
import ThemeSheet from './ThemeSheet.vue'
import WhatsNewSheet from './WhatsNewSheet.vue'
import GuideSearchSheet from './GuideSearchSheet.vue'
import { useEscapeClose } from '../lib/escapeClose'
import './account-rows.css'

// Backlog item 92: the header's account icon opens this instead of signing
// out directly. Two internal views instead of two components -- the design
// source (canvas T9pugexekjuJFtZ5oDYWtf, "Account deletion (item 92)") draws
// them as one flow, and neither needs to survive independently of the other.
// Issue #20 (design docs/design/issue-20-backup-restore.html) adds the "Your
// data" group and a third view, the restore preview (RestoreBackup.vue).
// Issue #93 puts a "What to back up" view (BackupOptions.vue) in front of
// Back up my data.
// Issue #1 (same canvas, row "Proposed: Reset my data, alongside Delete
// account") adds "Reset my data" between Sign out and Delete account, in
// Lavender so it reads as less severe than Delete's red.
// Issue #76: local mode has no account, so no "Signed in as" card or Sign
// out, and Delete account becomes Erase all data (same confirm view, typing
// ERASE).
// Issue #61: an About group at the bottom links the privacy policy and
// support page (App Store 5.1.1 wants the policy reachable in the app).
// Issue #98 (option A from #97, canvas EDBsWhYufYUoRW1cuKM7cT, artboards
// A1-A4): the menu is a short list of three rows, each opening a sub-screen
// (Preferences, Your data, Account & privacy) with a back button. The flows
// those screens open return to them, not to the menu.
// Issue #84: About gets "Report a bug" (BugReportSheet.vue), both modes.
// Issue #100: and "Request a feature" (FeatureRequestSheet.vue) below it.
// Issue #101: About opens with "What's new" (WhatsNewSheet.vue), dotted while
// there are notes the user hasn't seen, and Preferences gets a switch for
// Home's one-time "just updated" banner. Home's banner opens the sheet
// straight on What's new (accountSheetStartView).
// Issue #114: in local mode the menu has a permanent Premium group: what's
// included with Unlock and Restore, or a thank-you once it's unlocked.
// Issue #107: Preferences opens with a Theme row (ThemeSheet.vue).
// Issue #111: About links the repbunny.app guides index ("Help & guides")
// right after What's new, both modes.
// Issue #568: Help & guides now opens GuideSearchSheet.vue, the guides
// searchable and readable in the app with no network request.
// Issue #419: and "Lifting basics" (LiftingBasics.vue) under it, in the app
// so it works offline. Its starter program button opens Starter programs.
// Issue #234: ReportPrompt.vue opens the sheet straight on Report a bug with
// the error it offered (bugReportFocus).
// Issue #208: Your data gets "Import from another app" (ImportHistory.vue),
// Strong or Hevy history as past workouts.
// Issue #430: and "Restore points" (RestorePoints.vue), the
// copies the app saves on its own, which open in the same restore preview.
const emit = defineEmits<{ dismiss: [] }>()

const workout = useWorkoutsStore()
const profile = useProfileStore()
const router = useRouter()

type Section = 'prefs' | 'data' | 'privacy'
const startView = accountSheetStartView.value
const view = ref<'menu' | Section | 'delete' | 'reset' | 'restore' | 'restore-points' | 'auto-copy' | 'copies' | 'import' | 'backup' | 'bug' | 'feature' | 'whats-new' | 'theme' | 'guides'>(
  startView === 'rest' ? 'prefs' : startView,
)
accountSheetStartView.value = 'menu'
// Issue #234: the error ReportPrompt.vue's "Send report" opened this for.
const reportFocus = bugReportFocus.value
bugReportFocus.value = null
const sectionTitles: Record<Section, string> = {
  prefs: 'Preferences',
  data: 'Your data',
  privacy: 'Reset & erase',
}
const section = computed(() => (view.value in sectionTitles ? (view.value as Section) : null))
// Lifts the overlay above the on-screen keyboard (Report a bug's text box,
// the typed DELETE/RESET/ERASE confirms); sheets cap at --sheet-max-h.
const { overlayStyle } = useKeyboardViewport()
const confirmText = ref('')
const deleting = ref(false)
const deleteError = ref('')
const resetting = ref(false)
const resetError = ref('')

const deleteWord = 'ERASE'
const canDelete = computed(() => matchesConfirmWord(confirmText.value, deleteWord))
const canReset = computed(() => matchesConfirmWord(confirmText.value, 'RESET'))

// --- Issue #114: Premium (buy, restore, redeem: PremiumUnlockActions.vue, #531) ---

// --- Issue #113: dev-only Premium controls, to try the free version ---
// import.meta.env.DEV and an unset VITE_DEV_TOOLS (only the personal build sets
// it, #784) are literals in store builds, so the bundler drops the dynamic import
// and DevPremiumRows never ships. The rows can't live in this template: Vue reads
// script variables through unref(), which keeps a dead v-if branch alive.
const DevPremiumRows = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true'
  ? defineAsyncComponent(() => import('./DevPremiumRows.vue'))
  : null

// --- Issue #20: your data ---
const dataBusy = ref<'' | 'backup' | 'csv' | 'measurements-csv'>('')
const dataError = ref('')
const toast = ref<{ title: string; detail: string } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
const fileInput = ref<HTMLInputElement | null>(null)
const pickedBackup = ref<{ name: string; backup: BackupFile } | null>(null)
const restoreBlocked = computed(() => !!workout.activeWorkoutId)

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function showToast(title: string, detail: string) {
  toast.value = { title, detail }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 5000)
}

onUnmounted(() => clearTimeout(toastTimer))

function startBackup() {
  if (dataBusy.value) return
  dataError.value = ''
  view.value = 'backup'
}

function bugReportSent() {
  view.value = 'menu'
  showToast('Thanks for the report', 'Tap Send in your email app to finish.')
}

function featureRequestSent() {
  view.value = 'menu'
  showToast('Thanks for the idea', 'Tap Send in your email app to finish.')
}

function nativeHint() {
  return Capacitor.isNativePlatform() ? `. ${NATIVE_SAVE_HINT}` : ''
}

async function handleBackup(includes: BackupPart[]) {
  if (dataBusy.value) return
  dataBusy.value = 'backup'
  dataError.value = ''
  try {
    const backup = await buildBackup(includes)
    const name = backupFileName(new Date(), includes)
    const saved = await deliverFile(name, 'application/json', JSON.stringify(backup, null, 2))
    view.value = 'data'
    if (saved) showToast(deliveredTitle('Backup', Capacitor.isNativePlatform()), `${name} · ${backupContents(backup, includes)}${nativeHint()}`)
  } catch (e) {
    view.value = 'data'
    dataError.value = `Backup failed. ${e instanceof Error ? e.message : String(e)}`
  } finally {
    dataBusy.value = ''
  }
}

// The toast's detail: workouts and sets as before, or what a partial file has.
function backupContents(backup: BackupFile, includes: BackupPart[]) {
  if (includes.includes('history')) return `${plural(backup.workouts.length, 'workout')}, ${plural(backup.sets.length, 'set')}`
  if (includes.includes('templates')) return `${plural(backup.workout_templates.length, 'routine')}, ${plural(backup.exercises.length, 'exercise')}`
  return 'preferences'
}

async function handleCsv() {
  if (dataBusy.value) return
  dataBusy.value = 'csv'
  dataError.value = ''
  try {
    const backup = await buildBackup()
    const name = csvFileName()
    const saved = await deliverFile(name, 'text/csv', buildSetsCsv(backup))
    if (saved) showToast(deliveredTitle('CSV', Capacitor.isNativePlatform()), `${name} · ${plural(backup.sets.length, 'set')}${nativeHint()}`)
  } catch (e) {
    dataError.value = `Export failed. ${e instanceof Error ? e.message : String(e)}`
  } finally {
    dataBusy.value = ''
  }
}

// Issue #139: measurements don't fit the one-row-per-set file, so they get
// their own.
async function handleMeasurementsCsv() {
  if (dataBusy.value) return
  dataBusy.value = 'measurements-csv'
  dataError.value = ''
  try {
    const rows = await repos.backup.listAll('body_measurements')
    const name = measurementsCsvFileName()
    const saved = await deliverFile(name, 'text/csv', buildMeasurementsCsv({ body_measurements: rows }))
    if (saved) showToast(deliveredTitle('CSV', Capacitor.isNativePlatform()), `${name} · ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}${nativeHint()}`)
  } catch (e) {
    dataError.value = `Export failed. ${e instanceof Error ? e.message : String(e)}`
  } finally {
    dataBusy.value = ''
  }
}

function pickBackupFile() {
  if (restoreBlocked.value || dataBusy.value) return
  dataError.value = ''
  fileInput.value?.click()
}

async function handleFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const backup = parseBackup(await file.text())
  if (!backup) {
    dataError.value = "This isn't a RepBunny backup file."
    return
  }
  pickedBackup.value = { name: file.name, backup }
  view.value = 'restore'
}

function openRestorePoints() {
  if (restoreBlocked.value || dataBusy.value) return
  dataError.value = ''
  view.value = 'restore-points'
}

function pickRestorePoint(name: string, backup: BackupFile) {
  pickedBackup.value = { name, backup }
  view.value = 'restore'
}

function startImport() {
  if (restoreBlocked.value || dataBusy.value) return
  dataError.value = ''
  view.value = 'import'
}

function cancelRestore() {
  pickedBackup.value = null
  view.value = 'data'
}

function finishRestore() {
  emit('dismiss')
  router.push({ name: 'home' })
}

// --- Issue #53: default weight unit ---
const unitError = ref('')

const basicsOpen = ref(false)

function startFromBasics() {
  basicsOpen.value = false
  emit('dismiss')
  router.push({ name: 'templates', query: { programs: '1' } })
}

async function pickWeightUnit(unit: WeightUnit) {
  if (profile.weightUnit === unit) return
  unitError.value = ''
  const { error } = await profile.updateWeightUnit(unit)
  if (error) unitError.value = `Couldn't save the unit. ${error.message}`
}

// --- Issue #90: default rest timer ---
// Saved on change (blur or Done). Blank turns it off.
const defaultRestDraft = ref<number | string>(profile.defaultRestSeconds ?? '')
watch(
  () => profile.defaultRestSeconds,
  (seconds) => {
    defaultRestDraft.value = seconds ?? ''
  },
)
const defaultRestError = ref('')

async function saveDefaultRest() {
  const text = String(defaultRestDraft.value).trim()
  const seconds = text === '' ? null : Math.round(Number(text))
  if (seconds !== null && !(seconds > 0)) {
    defaultRestDraft.value = profile.defaultRestSeconds ?? ''
    return
  }
  defaultRestDraft.value = seconds ?? ''
  if (seconds === profile.defaultRestSeconds) return
  defaultRestError.value = ''
  const { error } = await profile.updateDefaultRestSeconds(seconds)
  if (error) defaultRestError.value = `Couldn't save the rest timer. ${error.message}`
}

// --- Issue #63: rest timer alerts, moved here from the Exercises tab ---
// A per-device setting, not an exercise. Backlog item 17 showed a one-line
// "on" note once enabled; issue #78 swapped web push for the phone's own
// notification permission, rechecked when the app comes back
// to the front, since the usual fix for "off" is a trip to Settings.
const restAlertState = ref<RestAlertPermission>('unsupported')
const restAlertExact = ref(true)
const restAlertBusy = ref(false)

async function refreshRestAlertState() {
  restAlertState.value = await restAlertPermission()
  restAlertExact.value = restAlertState.value === 'granted' ? await exactRestAlertsAllowed() : true
}

function handleRestAlertVisibility() {
  if (!document.hidden) refreshRestAlertState()
}

// Issue #429: opened from the rest screen's Edit, straight to the field.
const defaultRestInput = ref<HTMLInputElement | null>(null)
onMounted(() => {
  if (startView !== 'rest') return
  defaultRestInput.value?.scrollIntoView({ block: 'center' })
  defaultRestInput.value?.focus({ preventScroll: true })
})

onMounted(() => {
  refreshRestAlertState()
  document.addEventListener('visibilitychange', handleRestAlertVisibility)
})
onUnmounted(() => document.removeEventListener('visibilitychange', handleRestAlertVisibility))

type RestAlertRow = { on: boolean; caption: string; action?: { label: string; run: () => Promise<unknown> } }

const restAlertRow = computed<RestAlertRow | null>(() => {
  switch (restAlertState.value) {
    case 'granted':
      return restAlertExact.value
        ? { on: true, caption: 'Rest timer alerts are on for this phone.' }
        : {
            on: true,
            caption: 'On, but your phone may deliver them a little late. Allow alarms and reminders for RepBunny so they arrive right as your rest ends.',
            action: { label: 'Allow on-time alerts', run: allowExactRestAlerts },
          }
    case 'prompt':
      return {
        on: false,
        caption: 'Alerts you when a rest timer runs out, even if your phone is locked.',
        action: { label: 'Turn on rest timer alerts', run: requestRestAlerts },
      }
    case 'denied':
      return {
        on: false,
        caption: "Notifications are off for RepBunny, so rest timers can't alert you when your phone is locked. " + (restSettingsFailed.value ? `Turn them on in ${REST_ALERT_DIRECTIONS}.` : "Turn them on in your phone's Settings, under Apps, RepBunny, Notifications."),
        action: restSettingsFailed.value ? undefined : { label: 'Open settings', run: openRestAlertSettings },
      }
    default:
      return null
  }
})

const themeSummary = computed(() => {
  const { theme, mascot, outfit } = activeTheme.value
  const parts = [themeLabel(theme)]
  if (outfit !== 'match') parts.push(`${outfitLabel(outfit)} outfit`)
  parts.push(`${mascot === 'minimal' ? 'Minimal' : 'Full'} mascot`)
  return parts.join(' · ')
})

// The Preferences row's one-line summary on the menu, from live values.
// Issue #476: the Record celebrations choices, default first.
const RECORD_CELEBRATION_OPTIONS: { value: RecordCelebrations; label: string }[] = [
  { value: 'big', label: 'Big ones only' },
  { value: 'all', label: 'All wins' },
]

const prefsSummary = computed(() => {
  const parts: string[] = [
    profile.defaultWeightUnit,
    profile.defaultRestSeconds ? `Rest timer ${profile.defaultRestSeconds}s` : 'Rest timer off',
  ]
  if (restAlertRow.value) parts.push(restAlertRow.value.on ? 'Alerts on' : 'Alerts off')
  if (!milestoneMomentsOn.value) parts.push('Milestone moments off')
  if (recordCelebrations.value === 'all') parts.push('All wins celebrated')
  return parts.join(' · ')
})

async function requestRestAlerts() {
  await requestRestAlertPermission()
  await refreshRestAlertState()
}

async function allowExactRestAlerts() {
  await openExactRestAlertSetting()
  await refreshRestAlertState()
}

async function runRestAlertAction(run: () => Promise<unknown>) {
  if (restAlertBusy.value) return
  restAlertBusy.value = true
  try {
    await run()
  } finally {
    restAlertBusy.value = false
  }
}

function startDelete() {
  view.value = 'delete'
  confirmText.value = ''
  deleteError.value = ''
}

function cancelDelete() {
  view.value = 'privacy'
  confirmText.value = ''
  deleteError.value = ''
}

function startReset() {
  view.value = 'reset'
  confirmText.value = ''
  resetError.value = ''
}

// Issue #783: Escape (and Android back) steps out one screen at a time.
useEscapeClose(() => {
  if (view.value === 'menu') emit('dismiss')
  else if (view.value === 'delete') cancelDelete()
  else if (view.value === 'reset') cancelReset()
  else if (section.value) view.value = 'menu'
})

function cancelReset() {
  view.value = 'privacy'
  confirmText.value = ''
  resetError.value = ''
}

// No sign-out: the account and passkey stay, only the training data goes.
async function handleResetData() {
  if (!canReset.value || resetting.value) return
  resetting.value = true
  resetError.value = ''
  const { error } = await resetMyData()
  if (error) {
    resetting.value = false
    resetError.value = `Reset failed: ${error.message}. Nothing was changed.`
    return
  }
  await refetchAccountData()
  resetting.value = false
  emit('dismiss')
  router.push({ name: 'home' })
}

async function handleDeleteAccount() {
  if (!canDelete.value || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  const { error } = await eraseAllData()
  if (error) {
    deleting.value = false
    deleteError.value = error.message
    return
  }
  // The app stays open, so start it over empty, like a first launch.
  await refetchAccountData()
  router.push({ name: 'home' })
  deleting.value = false
  emit('dismiss')
}
</script>

<template>
  <div class="sheet-overlay" :style="overlayStyle" @click.self="emit('dismiss')">
    <div v-if="toast" class="toast" role="status">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 13l4 4L19 7"></path>
      </svg>
      <div>
        {{ toast.title }}
        <small>{{ toast.detail }}</small>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".json,application/json"
      class="file-input"
      aria-label="Backup file"
      tabindex="-1"
      @change="handleFilePicked"
    />

    <RestoreBackup
      v-if="view === 'restore' && pickedBackup"
      :file-name="pickedBackup.name"
      :backup="pickedBackup.backup"
      @cancel="cancelRestore"
      @done="finishRestore"
    />

    <RestorePoints v-else-if="view === 'restore-points'" @back="view = 'data'" @dismiss="emit('dismiss')" @pick="pickRestorePoint" />
    <AutoCopySheet v-else-if="view === 'auto-copy'" @back="view = 'data'" @dismiss="emit('dismiss')" />
    <YourCopies v-else-if="view === 'copies'" @back="view = 'data'" @dismiss="emit('dismiss')" @pick="pickRestorePoint" />
    <ImportHistory v-else-if="view === 'import'" @back="view = 'data'" @dismiss="emit('dismiss')" />

    <BackupOptions
      v-else-if="view === 'backup'"
      :busy="dataBusy === 'backup'"
      @cancel="view = 'data'"
      @save="handleBackup"
    />

    <ThemeSheet v-else-if="view === 'theme'" @back="view = 'prefs'" @dismiss="emit('dismiss')" />

    <WhatsNewSheet v-else-if="view === 'whats-new'" @back="view = 'menu'" @dismiss="emit('dismiss')" />

    <GuideSearchSheet v-else-if="view === 'guides'" @back="view = 'menu'" @dismiss="emit('dismiss')" />

    <BugReportSheet
      v-else-if="view === 'bug'"
      :focus="reportFocus"
      @back="view = 'menu'"
      @dismiss="emit('dismiss')"
      @sent="bugReportSent"
    />

    <FeatureRequestSheet
      v-else-if="view === 'feature'"
      @back="view = 'menu'"
      @dismiss="emit('dismiss')"
      @sent="featureRequestSent"
    />

    <div v-else-if="view === 'menu'" class="sheet" role="dialog" aria-modal="true" aria-label="Account">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-header">
        <h3 class="sheet-title">Account</h3>
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="data-group">
        <button type="button" class="data-item section-item" style="--c: var(--accent)" @click="view = 'prefs'">
          <span class="data-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"></path>
              <circle cx="15" cy="6" r="2"></circle>
              <circle cx="9" cy="12" r="2"></circle>
              <circle cx="17" cy="18" r="2"></circle>
            </svg>
          </span>
          <span class="data-text">
            <span class="data-title">Preferences</span>
            <span class="data-caption">{{ prefsSummary }}</span>
          </span>
          <span class="data-chevron" aria-hidden="true">›</span>
        </button>
        <button type="button" class="data-item section-item" style="--c: var(--secondary)" @click="view = 'data'">
          <span class="data-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v12M7 10l5 5 5-5"></path>
              <path d="M5 21h14"></path>
            </svg>
          </span>
          <span class="data-text">
            <span class="data-title">Your data</span>
            <span class="data-caption">Back up, restore, export CSV</span>
          </span>
          <span class="data-chevron" aria-hidden="true">›</span>
        </button>
        <button type="button" class="data-item section-item" style="--c: var(--highlight)" @click="view = 'privacy'">
          <span class="data-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path>
            </svg>
          </span>
          <span class="data-text">
            <span class="data-title">{{ sectionTitles.privacy }}</span>
            <span class="data-caption">Clear your training data or start over</span>
          </span>
          <span class="data-chevron" aria-hidden="true">›</span>
        </button>
      </div>

      <div class="data-label" id="premium-label">Premium</div>
      <div class="data-group" role="group" aria-labelledby="premium-label">
        <div class="pref-row stacked premium-row">
          <span class="rest-alert-head">
            <span class="data-title">{{ isPremium ? 'Premium is unlocked' : 'RepBunny Premium' }}</span>
            <span v-if="isPremium" class="on-pill">On</span>
          </span>
          <span class="data-caption">
            {{
              isPremium
                ? 'Thanks for backing RepBunny. All of this is yours for good.'
                : 'One-time unlock. Logging, history, backup, restore, and export stay free forever.'
            }}
          </span>
          <ul class="premium-includes">
            <li v-for="item in PREMIUM_INCLUDES" :key="item.label">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {{ item.label }}
            </li>
          </ul>
          <PremiumUnlockActions v-if="!isPremium" variant="card" />
        </div>
      </div>

      <div class="data-label" id="about-label">About</div>
      <div class="data-group" role="group" aria-labelledby="about-label">
        <button type="button" class="data-item" :class="{ unread: whatsNewUnread }" @click="view = 'whats-new'">
          <span class="data-title">What's new</span>
          <span v-if="whatsNewUnread" class="unread-dot" role="img" aria-label="New updates"></span>
          <span class="data-chevron" aria-hidden="true">›</span>
        </button>
        <button type="button" class="data-item" @click="view = 'guides'">
          <span class="data-title">Help &amp; guides</span>
          <span class="data-chevron" aria-hidden="true">›</span>
        </button>
        <button type="button" class="data-item" @click="basicsOpen = true">
          <span class="data-title">Lifting basics</span>
          <span class="data-chevron" aria-hidden="true">›</span>
        </button>
        <AboutLinkRows />
        <button type="button" class="data-item" @click="view = 'bug'">
          <span class="data-title">Report a bug</span>
          <span class="data-chevron" aria-hidden="true">›</span>
        </button>
        <button type="button" class="data-item" @click="view = 'feature'">
          <span class="data-title">Request a feature</span>
          <span class="data-chevron" aria-hidden="true">›</span>
        </button>
        <div class="data-item">
          <span class="data-title">Version</span>
          <span class="about-version">{{ currentVersionLabel() }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="section" class="sheet" role="dialog" aria-modal="true" aria-labelledby="section-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-header">
        <button type="button" class="sheet-back" aria-label="Back to Account" @click="view = 'menu'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 6l-6 6 6 6"></path>
          </svg>
        </button>
        <h3 id="section-title" class="sheet-title">{{ sectionTitles[section] }}</h3>
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <template v-if="section === 'prefs'">
        <div class="data-group" role="group" aria-labelledby="section-title">
          <button type="button" class="data-item" @click="view = 'theme'">
            <span class="data-text">
              <span class="data-title">Theme</span>
              <span class="data-caption">{{ themeSummary }}</span>
            </span>
            <span class="data-chevron" aria-hidden="true">›</span>
          </button>
          <div class="pref-row">
            <span class="data-text">
              <span class="data-title">Weight unit</span>
              <span class="data-caption">New exercises start in this unit</span>
            </span>
            <div role="group" aria-label="Weight unit" class="unit-toggle">
              <button
                v-for="u in (['lb', 'kg'] as const)"
                :key="u"
                type="button"
                :class="{ active: profile.weightUnit === u }"
                :aria-pressed="profile.weightUnit === u"
                @click="pickWeightUnit(u)"
              >
                {{ u }}
              </button>
            </div>
          </div>
          <div class="pref-row">
            <span class="data-text">
              <label for="default-rest" class="data-title">Default rest timer</label>
              <span id="default-rest-caption" class="data-caption">Seconds, for exercises without their own. Blank is off.</span>
            </span>
            <input
              id="default-rest"
              ref="defaultRestInput"
              v-model="defaultRestDraft"
              class="rest-default-input"
              type="number"
              inputmode="numeric"
              enterkeyhint="done"
              min="1"
              placeholder="Off"
              aria-describedby="default-rest-caption"
              @change="saveDefaultRest"
              @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            />
          </div>
          <div v-if="restAlertRow" class="pref-row stacked" role="group" aria-labelledby="rest-alerts-label">
            <span class="rest-alert-head">
              <span class="data-title" id="rest-alerts-label">Rest timer alerts</span>
              <span v-if="restAlertRow.on" class="on-pill">On</span>
            </span>
            <span class="data-caption">{{ restAlertRow.caption }}</span>
            <button
              v-if="restAlertRow.action"
              type="button"
              class="pref-action"
              :disabled="restAlertBusy"
              @click="runRestAlertAction(restAlertRow.action.run)"
            >
              {{ restAlertRow.action.label }}
            </button>
          </div>
          <div class="pref-row stacked" role="group" aria-labelledby="strength-sex-label">
            <span class="data-title" id="strength-sex-label">Strength standards</span>
            <StrengthSexPicker />
          </div>
          <div class="pref-row">
            <span class="data-text">
              <span id="whats-new-pref" class="data-title">Show what's new after updates</span>
              <span class="data-caption">A one-time note on the Log screen. Always in About.</span>
            </span>
            <button
              type="button"
              role="switch"
              class="switch"
              :aria-checked="whatsNewBannerOn"
              aria-labelledby="whats-new-pref"
              @click="setWhatsNewBannerOn(!whatsNewBannerOn)"
            >
              <span class="knob" aria-hidden="true"></span>
            </button>
          </div>
          <div class="pref-row">
            <span class="data-text">
              <span id="milestone-moments-pref" class="data-title">Milestone moments</span>
              <span class="data-caption">The card on your workout recap when you reach one. Milestones still count, under Progress.</span>
            </span>
            <button
              type="button"
              role="switch"
              class="switch"
              :aria-checked="milestoneMomentsOn"
              aria-labelledby="milestone-moments-pref"
              @click="setMilestoneMomentsOn(!milestoneMomentsOn)"
            >
              <span class="knob" aria-hidden="true"></span>
            </button>
          </div>
          <!-- Issue #476: full screen for records only, or small wins too
               (mockup: docs/design/issue-476-record-celebrations.html). -->
          <div class="pref-row stacked" role="group" aria-labelledby="record-celebrations-label">
            <span class="data-text">
              <span id="record-celebrations-label" class="data-title">Record celebrations</span>
              <span class="data-caption">The full screen for new records only, or for small wins like Heaviest yet too.</span>
            </span>
            <div class="choice-toggle">
              <button
                v-for="option in RECORD_CELEBRATION_OPTIONS"
                :key="option.value"
                type="button"
                :class="{ active: recordCelebrations === option.value }"
                :aria-pressed="recordCelebrations === option.value"
                @click="setRecordCelebrations(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <RatingAskRow /><SetupReplayRows @dismiss="emit('dismiss')" />
          <component :is="DevPremiumRows" v-if="DevPremiumRows" />
        </div>
        <p v-if="unitError" class="error" role="alert">{{ unitError }}</p>
        <p v-if="defaultRestError" class="error" role="alert">{{ defaultRestError }}</p>
      </template>

      <template v-else-if="section === 'data'">
        <div class="data-group" role="group" aria-labelledby="section-title">
          <button type="button" class="data-item" style="--c: var(--secondary)" :disabled="!!dataBusy" @click="startBackup">
            <span class="data-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v12M7 10l5 5 5-5"></path>
                <path d="M5 21h14"></path>
              </svg>
            </span>
            <span class="data-text">
              <span class="data-title">Back up my data</span>
              <span class="data-caption">Saves a file with everything, or just what you pick</span>
            </span>
            <span class="data-chevron" aria-hidden="true">›</span>
          </button>
          <AutoCopyRow :disabled="!!dataBusy" :blocked="restoreBlocked" @open="(next) => (view = next)" />
          <button
            type="button"
            class="data-item"
            style="--c: var(--highlight)"
            :disabled="restoreBlocked || !!dataBusy"
            :aria-describedby="restoreBlocked ? 'restore-blocked-note' : undefined"
            @click="pickBackupFile"
          >
            <span class="data-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 21V9M7 14l5-5 5 5"></path>
                <path d="M5 3h14"></path>
              </svg>
            </span>
            <span class="data-text">
              <span class="data-title">Restore from a backup</span>
              <span class="data-caption">{{ restoreBlocked ? 'Finish your workout first' : "Replaces what's here, or adds a partial file" }}</span>
            </span>
            <span class="data-chevron" aria-hidden="true">›</span>
          </button>
          <button
            type="button"
            class="data-item"
            style="--c: var(--secondary)"
            :disabled="restoreBlocked || !!dataBusy"
            :aria-describedby="restoreBlocked ? 'restore-blocked-note' : undefined"
            @click="openRestorePoints"
          >
            <span class="data-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7"></path>
                <path d="M3 4v5h5"></path>
                <path d="M12 8v4l3 2"></path>
              </svg>
            </span>
            <span class="data-text">
              <span class="data-title">Restore points</span>
              <span class="data-caption">{{ restoreBlocked ? 'Finish your workout first' : 'Copies saved before updates and after workouts' }}</span>
            </span>
            <span class="data-chevron" aria-hidden="true">›</span>
          </button>
          <button
            type="button"
            class="data-item"
            style="--c: var(--accent)"
            :disabled="restoreBlocked || !!dataBusy"
            :aria-describedby="restoreBlocked ? 'restore-blocked-note' : undefined"
            @click="startImport"
          >
            <span class="data-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12h12M12 7l5 5-5 5"></path>
                <path d="M20 4v16"></path>
              </svg>
            </span>
            <span class="data-text">
              <span class="data-title">Import from another app</span>
              <span class="data-caption">{{ restoreBlocked ? 'Finish your workout first' : 'Bring your Strong or Hevy history' }}</span>
            </span>
            <span class="data-chevron" aria-hidden="true">›</span>
          </button>
          <button type="button" class="data-item" style="--c: var(--success)" :disabled="!!dataBusy" @click="handleCsv">
            <span class="data-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2.5"></rect>
                <path d="M4 10h16M4 15h16M10 4v16"></path>
              </svg>
            </span>
            <span class="data-text">
              <span class="data-title">Export sets as CSV</span>
              <span class="data-caption">{{ dataBusy === 'csv' ? 'Saving…' : "For spreadsheets. Can't be restored." }}</span>
            </span>
          </button>
          <button type="button" class="data-item" style="--c: var(--success)" :disabled="!!dataBusy" @click="handleMeasurementsCsv">
            <span class="data-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2.5"></rect>
                <path d="M4 10h16M4 15h16M10 4v16"></path>
              </svg>
            </span>
            <span class="data-text">
              <span class="data-title">Export measurements as CSV</span>
              <span class="data-caption">{{ dataBusy === 'measurements-csv' ? 'Saving…' : 'Waist, chest, and the rest, by date.' }}</span>
            </span>
          </button>
        </div>
        <p v-if="restoreBlocked" id="restore-blocked-note" class="data-caption restore-blocked-note">Finish or discard your workout to restore or import.</p>
        <p v-if="dataError" class="error" role="alert">{{ dataError }}</p>
      </template>

      <template v-else>
        <div class="danger-zone" role="group" aria-labelledby="danger-zone-label">
          <span id="danger-zone-label" class="data-label">Can't be undone</span>

          <button type="button" class="account-action secondary-outline" @click="startReset">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
              <path d="M8 16H3v5"></path>
            </svg>
            Reset my data
          </button>
          <p class="account-caption">
            Clears your workouts, routines, exercises, and body-weight log.
          </p>

          <button type="button" class="account-action danger-outline" @click="startDelete">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"></path>
            </svg>
            Erase all data
          </button>
          <p class="account-caption">
            Permanently removes all of your training data and settings from this device.
          </p>
        </div>
      </template>
    </div>
    <div v-else-if="view === 'reset'" class="sheet" role="dialog" aria-modal="true" aria-label="Reset your data?">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="delete-header">
        <div class="delete-title-row">
          <span class="warning-badge lavender" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
              <path d="M8 16H3v5"></path>
            </svg>
          </span>
          <h3 class="delete-title">Reset your data?</h3>
        </div>
        <button type="button" class="sheet-close" aria-label="Close" :disabled="resetting" @click="cancelReset">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <p class="delete-intro">
        This permanently deletes your training data:
      </p>
      <ul class="delete-list">
        <li><span class="dot lavender" aria-hidden="true"></span>Workouts and every set in them</li>
        <li><span class="dot lavender" aria-hidden="true"></span>Routines</li>
        <li><span class="dot lavender" aria-hidden="true"></span>Exercises and setup notes</li>
        <li><span class="dot lavender" aria-hidden="true"></span>Body-weight log and height</li>
      </ul>
      <p class="delete-warning">It can't be undone.</p>

      <label for="confirm-reset">Type <strong>RESET</strong> to confirm</label>
      <input
        id="confirm-reset"
        v-model="confirmText"
        type="text"
        autocomplete="off"
        autocapitalize="characters"
        class="confirm-input"
        :class="{ 'ready-lavender': canReset }"
      />

      <p v-if="resetError" class="error" role="alert">{{ resetError }}</p>

      <button
        type="button"
        class="reset-confirm-button"
        :disabled="!canReset || resetting"
        @click="handleResetData"
      >
        {{ resetting ? 'Resetting…' : 'Reset my data' }}
      </button>
      <button type="button" class="ghost" :disabled="resetting" @click="cancelReset">Cancel</button>
    </div>

    <div v-else class="sheet" role="dialog" aria-modal="true" aria-label="Erase all data?">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="delete-header">
        <div class="delete-title-row">
          <span class="warning-badge" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 9v4M12 17h.01"></path>
              <path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>
            </svg>
          </span>
          <h3 class="delete-title">Erase all data?</h3>
        </div>
        <button type="button" class="sheet-close" aria-label="Close" @click="cancelDelete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <p class="delete-intro">
        This permanently deletes everything RepBunny keeps on this device:
      </p>
      <ul class="delete-list">
        <li><span class="dot" aria-hidden="true"></span>Workouts and every set in them</li>
        <li><span class="dot" aria-hidden="true"></span>Routines</li>
        <li><span class="dot" aria-hidden="true"></span>Exercises and setup notes</li>
        <li><span class="dot" aria-hidden="true"></span>Body-weight log and height</li>
        <li><span class="dot" aria-hidden="true"></span>Settings, like your weight unit</li>
      </ul>
      <p class="delete-warning">It can't be undone.</p>

      <label for="confirm-delete">Type <strong>{{ deleteWord }}</strong> to confirm</label>
      <input
        id="confirm-delete"
        v-model="confirmText"
        type="text"
        autocomplete="off"
        autocapitalize="characters"
        class="confirm-input"
        :class="{ ready: canDelete }"
      />

      <p v-if="deleteError" class="error">{{ deleteError }}</p>

      <button
        type="button"
        class="delete-confirm-button"
        :disabled="!canDelete || deleting"
        @click="handleDeleteAccount"
      >
        {{ deleting ? 'Erasing…' : 'Erase all data' }}
      </button>
      <button type="button" class="ghost" @click="cancelDelete">Cancel</button>
    </div>

    <LiftingBasics v-if="basicsOpen" return-label="Back to Account" @done="basicsOpen = false" @start-program="startFromBasics" />
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: min(82vh, var(--sheet-max-h, 82vh));
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* Issue #98: a sub-screen's title sits between Back and Close. */
.sheet-back + .sheet-title {
  flex-grow: 1;
  min-width: 0;
}

.sheet-back {
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sheet-title,
.delete-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

.sheet-close {
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.account-action {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
}

.data-label {
  margin: 2px 2px -4px;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.data-group {
  /* The sheet is a scrolling flex column; without this a tall menu squeezes
     the groups and their overflow: hidden clips rows off instead. */
  flex-shrink: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.section-item {
  min-height: 60px;
  padding: 10px 14px;
}

.section-item .data-chevron {
  font-size: 1.4rem;
  line-height: 1;
}

.data-item:first-child {
  border-top: none;
}

.data-item:disabled {
  opacity: 0.55;
}

.data-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--c) 16%, transparent);
  color: var(--c);
}

.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 10px 10px 14px;
}

.unit-toggle {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.unit-toggle button {
  min-height: 44px;
  width: 48px;
  padding: 0;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-weight: 700;
}

.unit-toggle button.active,
.choice-toggle button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

/* Issue #90: a <label>, so undo the global form-label look. */
label.data-title {
  margin: 0;
  color: var(--text);
}

.rest-default-input {
  flex-shrink: 0;
  width: 100px;
  min-height: 44px;
  text-align: center;
}

.choice-toggle {
  display: flex;
  gap: 6px;
}
.choice-toggle button {
  flex: 1 1 0;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
  font-size: 0.86rem;
}
.pref-row.stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding-right: 14px;
}

.rest-alert-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.on-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.pref-action {
  min-height: 44px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
}

.premium-includes {
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.premium-includes li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
  color: var(--text);
}

.premium-includes svg {
  flex-shrink: 0;
  color: var(--secondary);
}

.restore-blocked-note {
  margin: 10px 2px 0;
}

.data-item.unread {
  background: color-mix(in srgb, var(--secondary) 7%, transparent);
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--secondary);
  flex-shrink: 0;
}

/* Issue #101: same switch as BarbellSettings.vue's "Uses a barbell". */
.switch {
  position: relative;
  width: 46px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  margin-right: 4px;
  flex-shrink: 0;
  border-radius: 14px;
  background: var(--border);
  border: none;
}

.switch[aria-checked='true'] {
  background: var(--accent);
}

.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: left 0.15s ease;
}

.switch[aria-checked='true'] .knob {
  left: 21px;
  background: var(--accent-text);
}

.about-version {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--text-dim);
  overflow-wrap: anywhere;
  text-align: right;
}

.file-input {
  display: none;
}

.toast {
  position: fixed;
  top: calc(18px + var(--safe-top));
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 448px;
  z-index: 31;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--success) 16%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--success) 45%, transparent);
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--text);
}

.toast svg {
  flex-shrink: 0;
}

.toast small {
  display: block;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.danger-outline {
  background: transparent;
  border-color: color-mix(in srgb, var(--danger) 45%, transparent);
  color: var(--danger);
}

.secondary-outline {
  background: transparent;
  border-color: color-mix(in srgb, var(--secondary) 45%, transparent);
  color: var(--secondary);
}

.danger-zone {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
}

.danger-zone .data-label {
  margin: 0;
}

.account-caption {
  margin: -4px 2px 0;
  font-size: 0.75rem;
  color: var(--text-dim);
  text-align: center;
}

.delete-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.delete-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.warning-badge {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--danger) 16%, transparent);
  color: var(--danger);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.warning-badge.lavender {
  background: color-mix(in srgb, var(--secondary) 16%, transparent);
  color: var(--secondary);
}

.delete-intro {
  margin: 0;
  color: var(--text-dim);
}

.delete-list {
  list-style: none;
  margin: 0;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
}

.delete-list li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--danger);
  flex-shrink: 0;
}

.dot.lavender {
  background: var(--secondary);
}

.delete-warning {
  margin: 0;
  font-weight: 700;
  color: var(--text);
}

.confirm-input {
  font-weight: 700;
  letter-spacing: 0.06em;
}

.confirm-input.ready {
  border-color: var(--danger);
}

.confirm-input.ready-lavender {
  border-color: var(--secondary);
}

.reset-confirm-button {
  width: 100%;
  margin-top: 4px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--secondary) 35%, transparent);
  color: color-mix(in srgb, var(--secondary) 55%, transparent);
  font-weight: 800;
}

.reset-confirm-button:not(:disabled) {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--accent-text);
  cursor: pointer;
}

.reset-confirm-button:disabled {
  opacity: 1;
  cursor: not-allowed;
}

.delete-confirm-button {
  width: 100%;
  margin-top: 4px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
  color: color-mix(in srgb, var(--danger) 55%, transparent);
  font-weight: 800;
}

.delete-confirm-button:not(:disabled) {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--accent-text);
  cursor: pointer;
}

.delete-confirm-button:disabled {
  opacity: 1;
  cursor: not-allowed;
}

.ghost {
  width: 100%;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.8rem;
}
</style>
