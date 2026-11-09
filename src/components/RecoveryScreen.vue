<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { NATIVE_SAVE_HINT } from '../lib/deliveredTitle'
import { backupFileName, deliverFile, parseBackup, type BackupFile } from '../lib/backup'
import { backupForFailedUpdate, restoreAfterDamage, startFreshAfterDamage, type RecoveryReason } from '../lib/localRecovery'
import { listRestorePoints, loadRestorePoint, type RestorePointSummary } from '../lib/restorePoints'
import { getStoreVersion, recoveryVersionLine } from '../lib/storeVersion'
import BugReportSheet from './BugReportSheet.vue'
import RestorePoints from './RestorePoints.vue'

// Issue #431 (design docs/design/issue-431-recovery-screen.html, option A):
// local mode's full-screen recovery, mounted by main.ts in place of the app
// when the on-device data can't open (lib/localRecovery.ts). Damaged data
// offers the newest restore point (or a backup file when there's none); a
// failed update offers a backup file, since the data itself is fine. Nothing
// restores without a tap, and a restore reloads the app onto the new data.
const props = defineProps<{ reason: RecoveryReason }>()

const points = ref<RestorePointSummary[] | null>(props.reason === 'damaged' ? null : [])
const newest = computed(() => points.value?.[0] ?? null)
const view = ref<'main' | 'points' | 'bug'>('main')
const confirmingFresh = ref(false)
const busy = ref(false)
const error = ref('')
const note = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const versionLine = recoveryVersionLine(getStoreVersion(), __APP_VERSION__)

onMounted(async () => {
  if (props.reason !== 'damaged') return
  try {
    points.value = await listRestorePoints()
  } catch (e) {
    console.warn('Could not read restore points', e)
    points.value = []
  }
})

// "Oct 12, after Push day": the label reads as part of the sentence.
function pointSentence(point: RestorePointSummary) {
  const day = new Date(point.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `Your data from ${day}, ${point.label.charAt(0).toLowerCase()}${point.label.slice(1)}, is saved on this phone`
}

function pointCaption(point: RestorePointSummary) {
  const time = new Date(point.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${time} · ${point.workouts} workout${point.workouts === 1 ? '' : 's'}`
}

async function restore(load: () => Promise<BackupFile | null>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const backup = await load()
    if (!backup) throw new Error('That restore point is gone.')
    await restoreAfterDamage(backup)
    location.reload()
  } catch (e) {
    busy.value = false
    const message = (e instanceof Error ? e.message : String(e)).replace(/\.?$/, '.')
    error.value = `Couldn't restore it. ${message} Nothing was changed.`
  }
}

function restoreNewest() {
  const point = newest.value
  if (point) void restore(() => loadRestorePoint(point.id))
}

function pickPoint(_name: string, backup: BackupFile) {
  view.value = 'main'
  void restore(async () => backup)
}

function pickFile() {
  if (busy.value) return
  error.value = ''
  fileInput.value?.click()
}

async function handleFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const backup = parseBackup(await file.text())
  if (!backup) {
    error.value = "This isn't a RepBunny backup file."
    return
  }
  void restore(async () => backup)
}

// Issue #641: nothing is deleted; the damaged copy stays set aside. If that
// can't be done either, the error shows and the bug report is still there.
async function startFresh() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await startFreshAfterDamage()
    location.reload()
  } catch (e) {
    busy.value = false
    confirmingFresh.value = false
    const message = (e instanceof Error ? e.message : String(e)).replace(/\.?$/, '.')
    error.value = `Couldn't start fresh. ${message} Nothing was changed.`
  }
}

async function saveBackup() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  note.value = ''
  try {
    const backup = await backupForFailedUpdate()
    const name = backupFileName(new Date())
    if (await deliverFile(name, 'application/json', JSON.stringify(backup, null, 2))) note.value = Capacitor.isNativePlatform() ? `Shared ${name}. ${NATIVE_SAVE_HINT}.` : `Saved ${name}.`
  } catch (e) {
    error.value = `Couldn't save a backup file. ${e instanceof Error ? e.message : String(e)}`
  } finally {
    busy.value = false
  }
}

function bugSent() {
  view.value = 'main'
  note.value = 'Thanks for the report. Tap Send in your email app to finish.'
}
</script>

<template>
  <main class="recovery" aria-labelledby="recovery-title">
    <div class="screen">
      <div class="body">
        <div class="badge" :class="{ calm: reason === 'update-failed' }" aria-hidden="true">
          <svg v-if="reason === 'update-failed'" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <svg v-else width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
            <path d="M5 5.5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
            <path d="M5 11.5v6c0 1.4 3.1 2.5 7 2.5" />
            <path d="M17 15v3.2M17 21h.01" />
          </svg>
        </div>

        <template v-if="reason === 'update-failed'">
          <h1 id="recovery-title" class="title">This update couldn't finish</h1>
          <p class="lede">
            <b>Your workouts are safe and unchanged.</b> This version of RepBunny can't open them yet, and a fix is on
            the way. Update again when it shows up in the store.
          </p>
          <p class="fine">Want a copy in the meantime? A backup file opens in any version of RepBunny.</p>
        </template>

        <template v-else>
          <h1 id="recovery-title" class="title">Something went wrong opening your workouts</h1>
          <p v-if="points === null" class="lede">Looking for a saved copy…</p>
          <template v-else-if="newest">
            <p class="lede">RepBunny saves a copy of your data on this phone after every workout. You can pick up from the newest one.</p>
            <div class="point" data-testid="newest-restore-point">
              <span class="point-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span class="point-text">
                <span class="point-title">{{ pointSentence(newest) }}</span>
                <span class="point-caption">{{ pointCaption(newest) }}</span>
              </span>
            </div>
            <p class="fine">Anything logged after that isn't in it. The damaged copy is kept aside, not deleted.</p>
            <button type="button" class="link" :disabled="busy" @click="view = 'points'">See all restore points</button>
          </template>
          <template v-else>
            <p class="lede">There's no restore point saved on this phone yet. If you've saved a backup file, you can restore from that.</p>
            <p class="fine">The damaged copy is kept aside, not deleted.</p>
          </template>
        </template>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="note" class="note" role="status">{{ note }}</p>

      <template v-if="confirmingFresh">
        <h2 class="fresh-title">Start fresh?</h2>
        <p class="fine fresh-text">
          Your current data stays set aside on this phone. You can still bring it back later from a backup file or a
          restore point. RepBunny will open empty.
        </p>
        <button type="button" class="cta" :disabled="busy" @click="startFresh">{{ busy ? 'Starting…' : 'Start fresh' }}</button>
        <button type="button" class="ghost" :disabled="busy" @click="confirmingFresh = false">Cancel</button>
      </template>
      <template v-else>
      <button v-if="reason === 'update-failed'" type="button" class="cta" :disabled="busy" @click="saveBackup">
        {{ busy ? 'Saving…' : 'Save a backup file' }}
      </button>
      <button v-else-if="newest" type="button" class="cta" :disabled="busy" @click="restoreNewest">
        {{ busy ? 'Restoring…' : 'Restore it' }}
      </button>
      <button v-else-if="points" type="button" class="cta" :disabled="busy" @click="pickFile">
        {{ busy ? 'Restoring…' : 'Restore from a file' }}
      </button>
      <button v-if="reason === 'damaged'" type="button" class="ghost" :disabled="busy" @click="confirmingFresh = true">Start fresh</button>
      <button type="button" class="ghost" :disabled="busy" @click="view = 'bug'">Send a bug report</button>
      </template>
      <p class="version">{{ versionLine }}</p>
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

    <div v-if="view !== 'main'" class="sheet-overlay" @click.self="view = 'main'">
      <RestorePoints v-if="view === 'points'" restore-now @back="view = 'main'" @dismiss="view = 'main'" @pick="pickPoint" />
      <BugReportSheet v-else @back="view = 'main'" @dismiss="view = 'main'" @sent="bugSent" />
    </div>
  </main>
</template>

<style scoped>
.recovery {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  background: var(--bg);
  color: var(--text);
}

.screen {
  max-width: 440px;
  min-height: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: calc(18px + var(--safe-top)) 20px calc(20px + env(safe-area-inset-bottom, 0px));
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px 0 20px;
}

.badge {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  margin-bottom: 18px;
  background: color-mix(in srgb, var(--highlight) 16%, var(--surface-2));
  color: var(--highlight);
}

.badge.calm {
  background: color-mix(in srgb, var(--secondary) 18%, var(--surface-2));
  color: var(--secondary);
}

.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.15;
  text-transform: none;
  letter-spacing: normal;
}

.lede {
  margin: 8px 0 20px;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-dim);
}

.lede b {
  color: var(--text);
}

.point {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  text-align: left;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 16px;
}

.point-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--success) 18%, var(--surface-2));
  color: var(--success);
}

.point-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.point-title {
  font-weight: 800;
  font-size: 0.95rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.point-caption {
  margin-top: 2px;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.fine {
  margin: 10px 2px 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.link {
  margin-top: 14px;
  min-height: 44px;
  padding: 0 12px;
  background: none;
  border: none;
  color: var(--accent);
  font-weight: 800;
  font-size: 0.86rem;
}

.cta {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
  font-size: 1rem;
  box-shadow: 0 14px 28px -14px var(--accent);
}

.cta:active {
  background: var(--accent-pressed);
}

.cta:disabled {
  opacity: 0.7;
}

.ghost {
  background: none;
  border: none;
  color: var(--text-dim);
  font-weight: 700;
  font-size: 0.88rem;
  padding: 14px 0 4px;
}

.fresh-title {
  margin: 0;
  text-align: center;
  font-size: 1.1rem;
  font-weight: 800;
}

.fresh-text {
  margin: 8px 2px 16px;
  text-align: center;
}

.version {
  margin: 6px 0 0;
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-dim);
  opacity: 0.7;
}

.error,
.note {
  margin: 0 0 10px;
  font-size: 0.85rem;
  text-align: center;
}

.error {
  color: var(--danger);
}

.note {
  color: var(--text-dim);
}

.file-input {
  display: none;
}

.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
</style>
