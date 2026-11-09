<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { countCurrentData, isFullBackup, previewMerge, restoreBackup, summarizeBackup, type BackupFile } from '../lib/backup'
import type { MergePlan } from '../lib/backupMerge'
import { refetchAccountData } from '../lib/refetchAccountData'
import { matchesConfirmWord } from '../lib/confirmWord'
import { saveRestorePoint } from '../lib/restorePoints'
import { useWorkoutsStore } from '../stores/workouts'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #20, screens 2 and 3 of docs/design/issue-20-backup-restore.html:
// shows what's in a picked backup before anything changes, then replaces the
// account's data through restore_my_data() once RESTORE is typed. Rendered
// by AccountSheet.vue inside its own overlay.
// Issue #93: a partial file (v2 without all three parts) adds instead. The
// preview says what it will add, and there's nothing to type, since nothing
// is deleted.
const props = defineProps<{ fileName: string; backup: BackupFile }>()
const emit = defineEmits<{ cancel: []; done: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('cancel'))

const summary = computed(() => summarizeBackup(props.backup))
const current = ref<{ workouts: number; sets: number } | null>(null)
const confirmText = ref('')
const workout = useWorkoutsStore()
const hasUnfinishedWorkout = computed(() => !!(workout.activeWorkoutId || workout.recoverableWorkout))
const restoring = ref(false)
const restoreError = ref('')
const restored = ref(false)

const isMerge = computed(() => !isFullBackup(props.backup))
const mergePlan = ref<MergePlan | null>(null)
const previewError = ref('')
const includes = computed(() => props.backup.includes ?? [])

const canRestore = computed(() =>
  isMerge.value ? !!mergePlan.value && !restoring.value : matchesConfirmWord(confirmText.value, 'RESTORE') && !restoring.value,
)

onMounted(async () => {
  if (!isMerge.value) {
    current.value = await countCurrentData()
    return
  }
  try {
    mergePlan.value = await previewMerge(props.backup)
  } catch (e) {
    previewError.value = e instanceof Error ? e.message : String(e)
  }
})

function listText(items: string[]) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

// "Adds 4 templates and 12 exercises. Nothing is deleted."
function mergeText(plan: MergePlan, past: boolean) {
  const added: string[] = []
  if (plan.workout_templates.length) added.push(plural(plan.workout_templates.length, 'routine'))
  if (plan.exercises.length) added.push(plural(plan.exercises.length, 'exercise'))
  if (plan.workouts.length) added.push(plural(plan.workouts.length, 'workout'))
  if (plan.body_weight_entries.length) added.push(plural(plan.body_weight_entries.length, 'weigh-in'))
  if (plan.body_measurements.length) added.push(plural(plan.body_measurements.length, 'measurement'))
  const verbs: string[] = []
  if (added.length) verbs.push(`${past ? 'Added' : 'Adds'} ${listText(added)}`)
  if (plan.profile) verbs.push(`${past ? 'updated' : 'updates'} your preferences`)
  if (verbs.length === 0) return past ? 'Nothing new was in this file.' : 'Nothing new to add from this file.'
  const sentence = verbs.join(added.length > 1 ? ', and ' : ' and ')
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.'
}

// Issue #486: nothing in the file would change anything, so say so up front.
const nothingNew = computed(() => {
  const plan = mergePlan.value
  return (
    !!plan &&
    !plan.profile &&
    plan.exerciseUpdates.length === 0 &&
    plan.exercises.length + plan.workout_templates.length + plan.workouts.length + plan.body_weight_entries.length + plan.body_measurements.length === 0
  )
})

const mergePreviewText = computed(() => {
  const plan = mergePlan.value
  if (!plan) return ''
  if (nothingNew.value) return 'Everything in this file is already in your account. Nothing will change.'
  const fromArchive = plan.unarchivedExercises > 0 ? ` (${plan.unarchivedExercises} brought back from the archive)` : ''
  const reused =
    plan.reusedExercises > 0
      ? ` ${plural(plan.reusedExercises, 'exercise')} you already have ${plan.reusedExercises === 1 ? 'is' : 'are'} reused${fromArchive}.`
      : ''
  const skipped =
    plan.skippedTemplates > 0
      ? ` ${plural(plan.skippedTemplates, 'routine')} you already have ${plan.skippedTemplates === 1 ? 'is' : 'are'} skipped.`
      : ''
  return `${mergeText(plan, false)} Nothing is deleted.${reused}${skipped}`
})

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

const dayFormat: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
const fullDayFormat: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, fullDayFormat)
}

const backedUpAt = computed(() => {
  const date = new Date(props.backup.exported_at)
  if (Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${formatDay(props.backup.exported_at)} · ${time}`
})

// "Jun 3 – Sep 12, 2026", with the first year only when the two differ.
const dateRange = computed(() => {
  const { firstWorkout, lastWorkout } = summary.value
  if (!firstWorkout || !lastWorkout) return 'No workouts'
  const first = new Date(firstWorkout)
  const last = new Date(lastWorkout)
  if (first.toDateString() === last.toDateString()) return formatDay(lastWorkout)
  const firstText = first.toLocaleDateString(
    undefined,
    first.getFullYear() === last.getFullYear() ? dayFormat : fullDayFormat,
  )
  return `${firstText} – ${formatDay(lastWorkout)}`
})

const rangeCaption = computed(() => {
  const extras: string[] = []
  if (summary.value.weighIns > 0) extras.push(plural(summary.value.weighIns, 'weigh-in'))
  if (summary.value.measurements > 0) extras.push(plural(summary.value.measurements, 'measurement'))
  if (summary.value.hasHeight) extras.push('your height')
  const base = summary.value.workouts > 0 ? 'workouts from' : 'in this backup'
  return extras.length > 0 ? `${base} · plus ${extras.join(' and ')}` : base
})

const restoredText = computed(() => {
  const s = summary.value
  const asOf = Number.isNaN(new Date(props.backup.exported_at).getTime()) ? '' : `, as of ${formatDay(props.backup.exported_at)}`
  const measurements = s.measurements > 0 ? `, and ${plural(s.measurements, 'measurement')}` : ''
  const weighIns = measurements ? `, ${plural(s.weighIns, 'weigh-in')}` : `, and ${plural(s.weighIns, 'weigh-in')}`
  return `${plural(s.workouts, 'workout')}, ${plural(s.sets, 'set')}, ${plural(s.exercises, 'exercise')}, ${plural(s.templates, 'routine')}${weighIns}${measurements} are back${asOf}.`
})

const restoredTitle = computed(() => (isMerge.value ? 'Added from backup' : 'Backup restored'))

const doneText = computed(() => (isMerge.value && mergePlan.value ? mergeText(mergePlan.value, true) : restoredText.value))

async function handleRestore() {
  if (!canRestore.value) return
  restoring.value = true
  restoreError.value = ''
  // Issue #430: so a restore can itself be undone (local mode only).
  await saveRestorePoint('restore', 'Before a restore')
  const { error } = await restoreBackup(props.backup)
  if (error) {
    restoring.value = false
    restoreError.value = `Restore failed: ${error.message}. Nothing was changed.`
    return
  }
  await refetchAccountData()
  restoring.value = false
  restored.value = true
}
</script>

<template>
  <div v-if="restored" class="sheet" role="dialog" aria-modal="true" :aria-label="restoredTitle">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="done-badge" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 13l4 4L19 7"></path>
      </svg>
    </div>
    <div class="done-text">
      <h3 class="sheet-title">{{ restoredTitle }}</h3>
      <p>{{ doneText }}</p>
    </div>
    <button type="button" class="done-button" @click="emit('done')">Done</button>
  </div>

  <div v-else class="sheet" role="dialog" aria-modal="true" :aria-label="isMerge ? 'Add from this backup?' : 'Restore this backup?'">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <h3 class="sheet-title">{{ isMerge ? 'Add from this backup?' : 'Restore this backup?' }}</h3>
      <button type="button" class="sheet-close" aria-label="Close" :disabled="restoring" @click="emit('cancel')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="file-card">
      <span class="file-icon" aria-hidden="true">JSON</span>
      <div class="file-info">
        <span class="file-name">{{ fileName }}</span>
        <span v-if="backedUpAt" class="file-date">Backed up {{ backedUpAt }}</span>
      </div>
    </div>

    <template v-if="isMerge">
      <div class="counts">
        <template v-if="includes.includes('history')">
          <div class="count"><b>{{ summary.workouts }}</b><span>workouts</span></div>
          <div class="count"><b>{{ summary.sets }}</b><span>sets</span></div>
        </template>
        <div v-if="summary.exercises || includes.includes('templates')" class="count"><b>{{ summary.exercises }}</b><span>exercises</span></div>
        <div v-if="includes.includes('templates')" class="count"><b>{{ summary.templates }}</b><span>routines</span></div>
        <div v-if="includes.includes('preferences')" class="count wide"><b>Preferences</b><span>weight unit, rest timer, height, reminders, plates</span></div>
      </div>

      <p v-if="previewError" class="error" role="alert">Couldn't read your current data: {{ previewError }}</p>
      <div v-else class="info">{{ mergePlan ? mergePreviewText : "Checking what's new…" }}</div>
    </template>

    <template v-else>
      <div class="counts">
        <div class="count"><b>{{ summary.workouts }}</b><span>workouts</span></div>
        <div class="count"><b>{{ summary.sets }}</b><span>sets</span></div>
        <div class="count"><b>{{ summary.exercises }}</b><span>exercises</span></div>
        <div class="count"><b>{{ summary.templates }}</b><span>routines</span></div>
        <div class="count wide"><b>{{ dateRange }}</b><span>{{ rangeCaption }}</span></div>
      </div>

      <div class="warn">
        This <b>replaces everything</b> in your account right now<template v-if="current">
          ({{ plural(current.workouts, 'workout') }}, {{ plural(current.sets, 'set') }})</template>.<template v-if="hasUnfinishedWorkout"> Your unfinished workout will be erased too.</template>
      </div>

      <label for="confirm-restore">Type <strong>RESTORE</strong> to confirm</label>
      <input
        id="confirm-restore"
        v-model="confirmText"
        type="text"
        autocomplete="off"
        autocapitalize="characters"
        class="confirm-input"
        :class="{ ready: matchesConfirmWord(confirmText, 'RESTORE') }"
      />
    </template>

    <p v-if="restoreError" class="error" role="alert">{{ restoreError }}</p>

    <button v-if="isMerge && nothingNew" type="button" class="done-button" @click="emit('done')">Done</button>
    <button v-else type="button" class="restore-button" :class="{ merge: isMerge }" :disabled="!canRestore" @click="handleRestore">
      {{ restoring ? (isMerge ? 'Adding…' : 'Restoring…') : isMerge ? 'Add to my data' : 'Replace with this backup' }}
    </button>
    <button v-if="!(isMerge && nothingNew)" type="button" class="ghost" :disabled="restoring" @click="emit('cancel')">Cancel</button>
  </div>
</template>

<style scoped>
.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  gap: 12px;
}

.sheet-title {
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

.file-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.file-icon {
  width: 40px;
  height: 46px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  color: var(--secondary);
  font-size: 0.62rem;
  font-weight: 800;
}

.file-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.file-name {
  font-family: Consolas, ui-monospace, monospace;
  font-size: 0.88rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.file-date {
  margin-top: 2px;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.counts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.count {
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.count b {
  display: block;
  font-family: var(--font-display);
  font-size: 1.3rem;
  line-height: 1.1;
  color: var(--text);
}

.count span {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--text-dim);
}

.count.wide {
  grid-column: 1 / -1;
}

.warn {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--highlight) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--highlight) 45%, var(--border));
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text);
}

label {
  margin: 0;
}

label strong {
  color: var(--text);
}

.confirm-input {
  font-weight: 800;
  letter-spacing: 0.06em;
}

.confirm-input.ready {
  border-color: var(--highlight);
}

.restore-button {
  width: 100%;
  min-height: 50px;
  border-radius: 14px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--highlight) 35%, transparent);
  color: color-mix(in srgb, var(--highlight) 55%, transparent);
  font-weight: 800;
}

.restore-button:not(:disabled) {
  background: var(--highlight);
  border-color: var(--highlight);
  color: var(--accent-text);
}

.restore-button:disabled {
  opacity: 1;
  cursor: not-allowed;
}

.ghost {
  width: 100%;
  min-height: 50px;
  border-radius: 14px;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
  font-weight: 800;
}

.info {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--secondary) 45%, var(--border));
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text);
}

.restore-button.merge:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.8rem;
}

.done-badge {
  width: 64px;
  height: 64px;
  margin: 6px auto 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--success) 18%, transparent);
  color: var(--success);
}

.done-text {
  text-align: center;
}

.done-text p {
  margin: 4px 0 0;
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--text-dim);
}

.done-button {
  width: 100%;
  min-height: 50px;
  border-radius: 14px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}
</style>
