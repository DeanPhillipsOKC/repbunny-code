<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { repos } from '../data'
import { previewMerge, restoreBackup } from '../lib/backup'
import {
  IMPORT_APPS,
  appLabel,
  buildImportPlan,
  detectApp,
  existingWorkoutKeys,
  parseImport,
  sourceExercises,
  warmupCount,
  type ImportApp,
  type ImportTarget,
  type ParsedImport,
  type SourceExercise,
} from '../lib/importHistory'
import { answerTarget, bestGuess, candidateName, candidateSubline, rankCandidates, rememberAnswers, rememberedAnswer, searchCandidates, type ImportAnswer, type ImportCandidate } from '../lib/importMatch'
import { refetchAccountData } from '../lib/refetchAccountData'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #208 (mockup docs/design/issue-208-import-history.html, option B):
// Account > Your data > Import from another app. Pick the app, then its CSV,
// read on the device. Every distinct exercise name gets one row to confirm
// (Yes / Other…), nothing is written until all are answered, and the import
// is a history-only partial backup merged like a partial restore (#93). A
// workout already here (same day, same sets) is skipped. Rendered by
// AccountSheet.vue in its overlay.
const emit = defineEmits<{ back: []; dismiss: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => (otherRow.value ? (otherRow.value = null) : back()))

const router = useRouter()
const exercises = useExercisesStore()
const profile = useProfileStore()

const step = ref<'pick' | 'review' | 'confirm' | 'done'>('pick')
const app = ref<ImportApp>('strong')
const appInfo = computed(() => IMPORT_APPS.find((a) => a.app === app.value)!)
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const fileText = ref('')
const pickError = ref('')
const otherApp = ref<ImportApp | null>(null)
const loading = ref(false)

const parsed = ref<ParsedImport | null>(null)
const existingKeys = ref<Set<string>>(new Set())
const setCounts = ref<Map<string, number>>(new Map())

interface ReviewRow {
  source: SourceExercise
  ranked: ImportCandidate[]
  guess: ImportCandidate | null
  answer: ImportAnswer | null
}
const rows = ref<ReviewRow[]>([])
const answered = computed(() => rows.value.filter((r) => r.answer).length)
const allAnswered = computed(() => rows.value.length > 0 && answered.value === rows.value.length)

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}

function chooseFile() {
  pickError.value = ''
  otherApp.value = null
  fileInput.value?.click()
}

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  fileName.value = file.name
  fileText.value = await file.text()
  await readFile()
}

async function readFile() {
  pickError.value = ''
  otherApp.value = null
  const result = parseImport(fileText.value, app.value)
  if (!result) {
    const detected = detectApp(fileText.value)
    if (detected && detected !== app.value) {
      otherApp.value = detected
      pickError.value = `This doesn't look like a ${appLabel(app.value)} export. It looks like ${appLabel(detected)}'s.`
    } else {
      pickError.value = `This doesn't look like a ${appLabel(app.value)} export, or none of its rows could be read (each needs an exercise, a date, and a set number).`
    }
    return
  }
  loading.value = true
  try {
    if (!exercises.fetched) await exercises.fetchExercises()
    const [workoutRows, setRows] = await Promise.all([repos.backup.listAll('workouts'), repos.backup.listAll('sets')])
    existingKeys.value = existingWorkoutKeys(workoutRows, setRows)
    const counts = new Map<string, number>()
    for (const s of setRows) counts.set(String(s.exercise_id), (counts.get(String(s.exercise_id)) ?? 0) + 1)
    setCounts.value = counts
  } catch (e) {
    pickError.value = `Couldn't read your current data: ${e instanceof Error ? e.message : String(e)}`
    return
  } finally {
    loading.value = false
  }
  parsed.value = result
  includeWarmups.value = false
  fallbackUnit.value = profile.defaultWeightUnit
  const built = sourceExercises(result).map((source): ReviewRow => {
    const ranked = rankCandidates(source, exercises.exercises)
    return { source, ranked, guess: bestGuess(ranked), answer: rememberedAnswer(result.app, source, exercises.exercises) }
  })
  // Unanswered first, once: answered rows stay put after that.
  rows.value = [...built.filter((r) => !r.answer), ...built.filter((r) => r.answer)]
  step.value = allAnswered.value ? 'confirm' : 'review'
}

function switchApp() {
  if (!otherApp.value) return
  app.value = otherApp.value
  readFile()
}

function sourceSetCount(row: ReviewRow) {
  return plural(row.source.sets, 'set')
}

function tagFor(c: ImportCandidate) {
  return c.kind === 'mine' ? 'Yours' : 'Library'
}

const TRACKING: Record<string, string> = {
  weight: 'weight',
  bodyweight: 'bodyweight',
  assisted: 'assisted',
  timed: 'timed',
  level: 'level',
}

function capitalized(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function newCaption(source: SourceExercise) {
  return `Adds it as a ${TRACKING[source.loadType]} exercise`
}

function answerName(row: ReviewRow) {
  return row.answer?.kind === 'candidate' ? candidateName(row.answer.candidate) : 'New exercise'
}

function answerTag(row: ReviewRow) {
  return row.answer?.kind === 'candidate' ? tagFor(row.answer.candidate) : TRACKING[row.source.loadType]
}

function acceptGuess(row: ReviewRow) {
  row.answer = row.guess ? { kind: 'candidate', candidate: row.guess } : { kind: 'new' }
}

function change(row: ReviewRow) {
  row.answer = null
}

// --- The Other… sheet ---
const otherRow = ref<ReviewRow | null>(null)
const query = ref('')

function openOther(row: ReviewRow) {
  query.value = ''
  otherRow.value = row
}

const searching = computed(() => query.value.trim().length > 0)
const sheetMine = computed(() => {
  const row = otherRow.value
  if (!row) return []
  if (searching.value) return searchCandidates(query.value, row.source, exercises.exercises).filter((c) => c.kind === 'mine')
  return row.ranked.filter((c) => c.kind === 'mine').slice(0, 5)
})
const sheetLibrary = computed(() => {
  const row = otherRow.value
  if (!row) return []
  if (searching.value) return searchCandidates(query.value, row.source, exercises.exercises).filter((c) => c.kind === 'library').slice(0, 20)
  return row.ranked.filter((c) => c.kind === 'library').slice(0, 6)
})

function pickCandidate(c: ImportCandidate) {
  if (!otherRow.value) return
  otherRow.value.answer = { kind: 'candidate', candidate: c }
  otherRow.value = null
}

function pickNew() {
  if (!otherRow.value) return
  otherRow.value.answer = { kind: 'new' }
  otherRow.value = null
}

// --- Confirm ---
const includeWarmups = ref(false)
const UNITS = ['lb', 'kg'] as const
const fallbackUnit = ref<'lb' | 'kg'>('lb')
const warmups = computed(() => (parsed.value ? warmupCount(parsed.value) : 0))

const targets = computed(() => {
  const map = new Map<string, ImportTarget>()
  const result = parsed.value
  if (!result) return map
  for (const row of rows.value) {
    if (row.answer) map.set(row.source.name, answerTarget(row.answer, row.source, result.app, exercises.exercises))
  }
  return map
})

const plan = computed(() =>
  parsed.value && allAnswered.value
    ? buildImportPlan({
        parsed: parsed.value,
        targets: targets.value,
        includeWarmups: includeWarmups.value,
        fallbackUnit: fallbackUnit.value,
        existingKeys: existingKeys.value,
      })
    : null,
)

const newExercises = ref<number | null>(null)
watch(
  () => (step.value === 'confirm' ? plan.value : null),
  async (current) => {
    newExercises.value = null
    if (!current) return
    try {
      const merge = await previewMerge(current.file)
      if (current === plan.value) newExercises.value = merge.exercises.length
    } catch {
      // The count is a nicety; the import itself reports any real error.
    }
  },
  { immediate: true },
)

const matchedExercises = computed(() => (plan.value && newExercises.value !== null ? plan.value.file.exercises.length - newExercises.value : null))

const dateRange = computed(() => {
  const list = parsed.value?.workouts ?? []
  if (list.length === 0) return ''
  const format: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const first = new Date(list[0].startedAt).toLocaleDateString(undefined, format)
  const last = new Date(list[list.length - 1].startedAt).toLocaleDateString(undefined, format)
  return first === last ? first : `${first} – ${last}`
})

const importing = ref(false)
const importError = ref('')
const imported = ref<{ workouts: number; sets: number; created: number } | null>(null)

async function runImport() {
  const current = plan.value
  if (!current || current.workouts === 0 || importing.value || !parsed.value) return
  importing.value = true
  importError.value = ''
  // A quick tap can beat the preview's count, so count here if it hasn't.
  let created = newExercises.value
  if (created === null) {
    try {
      created = (await previewMerge(current.file)).exercises.length
    } catch {
      created = 0
    }
  }
  const { error } = await restoreBackup(current.file)
  if (error) {
    importing.value = false
    importError.value = `Import failed: ${error.message}. Nothing was changed.`
    return
  }
  rememberAnswers(parsed.value.app, targets.value)
  await refetchAccountData()
  importing.value = false
  imported.value = { workouts: current.workouts, sets: current.sets, created }
  step.value = 'done'
}

const doneText = computed(() => {
  const r = imported.value
  if (!r) return ''
  const created = r.created > 0 ? `, and created ${plural(r.created, 'exercise')}` : ''
  return `Added ${plural(r.workouts, 'workout')} and ${plural(r.sets, 'set')}${created}. Your records and charts are up to date.`
})

function seeProgress() {
  emit('dismiss')
  router.push({ name: 'progress' })
}

function back() {
  if (step.value === 'confirm' && rows.value.length > 0) step.value = 'review'
  else if (step.value === 'review') step.value = 'pick'
  else emit('back')
}

const title = computed(() => {
  if (step.value === 'review') return 'Match your exercises'
  if (step.value === 'confirm') {
    if (!plan.value) return 'Import'
    return plan.value.workouts > 0 ? `Import ${plural(plan.value.workouts, 'workout')}?` : 'Already imported'
  }
  return 'Import from another app'
})
</script>

<template>
  <div v-if="step === 'done'" class="sheet" role="dialog" aria-modal="true" aria-label="Import finished">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="done-badge" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 13l4 4L19 7"></path>
      </svg>
    </div>
    <div class="done-text">
      <h3 class="sheet-title">Welcome over from {{ appInfo.label }}</h3>
      <p>{{ doneText }}</p>
    </div>
    <button type="button" class="primary" @click="seeProgress">See my progress</button>
    <button type="button" class="ghost" @click="emit('dismiss')">Done</button>
  </div>

  <div v-else class="sheet" :class="{ 'has-dock': step === 'review' }" role="dialog" aria-modal="true" :aria-label="title">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <button type="button" class="sheet-icon" aria-label="Back" :disabled="importing" @click="back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <h3 class="sheet-title">{{ title }}</h3>
      <button type="button" class="sheet-icon" aria-label="Close" :disabled="importing" @click="emit('dismiss')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <template v-if="step === 'pick'">
      <p class="lede">Your past workouts come in as history, so records, "last time", and charts work from day one.</p>
      <div class="apps" role="radiogroup" aria-label="Import from">
        <button
          v-for="a in IMPORT_APPS"
          :key="a.app"
          type="button"
          role="radio"
          class="app"
          :class="{ sel: app === a.app }"
          :aria-checked="app === a.app"
          @click="app = a.app"
        >
          <span class="app-name">{{ a.label }} <span class="radio" :class="{ on: app === a.app }" aria-hidden="true"></span></span>
          <span class="app-sub">{{ a.fileName }}</span>
        </button>
      </div>
      <p class="soon">Fitbod, FitNotes, and JEFIT are next.</p>
      <div class="card">
        <p class="sec">Export from {{ appInfo.label }} first</p>
        <ol class="how">
          <li v-for="line in appInfo.steps" :key="line">{{ line }}</li>
        </ol>
      </div>
      <div class="privacy">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2"></rect>
          <path d="M8 11V8a4 4 0 0 1 8 0v3"></path>
        </svg>
        <span>The file is read on this phone. Nothing is uploaded.</span>
      </div>
      <p v-if="pickError" class="error" role="alert">{{ pickError }}</p>
      <button v-if="otherApp" type="button" class="ghost" @click="switchApp">Import it as {{ appLabel(otherApp) }}</button>
      <button type="button" class="primary" :disabled="loading" @click="chooseFile">{{ loading ? 'Reading…' : 'Choose file' }}</button>
      <input
        ref="fileInput"
        type="file"
        accept=".csv,text/csv,text/comma-separated-values,text/plain"
        class="file-input"
        aria-label="Export file"
        tabindex="-1"
        @change="handleFile"
      />
    </template>

    <template v-else-if="step === 'review'">
      <div class="progress">
        <span>{{ answered }} of {{ rows.length }} answered</span>
        <span class="bar" aria-hidden="true"><span :style="{ width: `${(answered / rows.length) * 100}%` }"></span></span>
      </div>
      <ul class="review-list">
        <li v-for="row in rows" :key="row.source.name" class="row" :class="{ done: row.answer }" :aria-label="row.source.name" data-testid="import-row">
          <div class="src">
            <span class="src-name">{{ row.source.name }}</span>
            <span class="src-meta">{{ sourceSetCount(row) }}</span>
          </div>
          <div v-if="row.answer" class="ans" role="status">
            <svg class="ok" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
              <path d="M5 13l4 4L19 7"></path>
            </svg>
            <span class="arrow" aria-hidden="true">→</span>
            <b>{{ answerName(row) }}</b>
            <span class="tag" :class="row.answer.kind === 'candidate' ? (row.answer.candidate.kind === 'mine' ? 'yours' : 'lib') : 'new'">{{ answerTag(row) }}</span>
            <button type="button" class="change" @click="change(row)">Change</button>
          </div>
          <template v-else>
            <div class="guess" :class="{ none: !row.guess }">
              <span class="guess-text">
                <span class="opt-name">{{ row.guess ? candidateName(row.guess) : 'No close match' }}</span>
                <span class="opt-sub">{{ row.guess ? candidateSubline(row.guess, setCounts) : newCaption(row.source) }}</span>
              </span>
              <span class="tag" :class="row.guess ? (row.guess.kind === 'mine' ? 'yours' : 'lib') : 'new'">{{ row.guess ? tagFor(row.guess) : 'New' }}</span>
            </div>
            <div class="acts">
              <button type="button" class="yes" @click="acceptGuess(row)">{{ row.guess ? 'Yes, same one' : 'Add as new' }}</button>
              <button type="button" class="other" @click="openOther(row)">Other…</button>
            </div>
          </template>
        </li>
      </ul>
      <div class="dock">
        <p class="hintline">
          {{ allAnswered ? 'All answered. Next, check what will be added.' : `Answer all ${rows.length} to import. Nothing is saved until then.` }}
        </p>
        <button type="button" class="primary" :disabled="!allAnswered" @click="step = 'confirm'">Import {{ plural(parsed?.workouts.length ?? 0, 'workout') }}</button>
      </div>
    </template>

    <template v-else-if="step === 'confirm' && plan">
      <div class="file-card">
        <span class="file-icon" aria-hidden="true">CSV</span>
        <span class="file-info">
          <span class="file-name">{{ fileName }}</span>
          <span class="file-date">From {{ appInfo.label }} · {{ dateRange }}</span>
        </span>
      </div>
      <div class="counts">
        <div class="count"><b>{{ plan.workouts.toLocaleString() }}</b><span>workouts</span></div>
        <div class="count"><b>{{ plan.sets.toLocaleString() }}</b><span>sets</span></div>
        <div class="count"><b>{{ matchedExercises ?? '…' }}</b><span>exercises matched</span></div>
        <div class="count"><b>{{ newExercises ?? '…' }}</b><span>new exercises</span></div>
        <div v-if="parsed && parsed.unreadable > 0" class="count wide">
          <b>{{ plural(parsed.unreadable, 'row') }} left out</b><span>{{ parsed.unreadable === 1 ? "this row couldn't" : "these rows couldn't" }} be read, no exercise, date, or set number</span>
        </div>
        <div v-if="plan.skipped > 0" class="count wide">
          <b>{{ plan.skipped.toLocaleString() }} skipped</b><span>you already have these, same day and same sets</span>
        </div>
      </div>
      <div v-if="!parsed?.unitsKnown" class="unit-row" role="radiogroup" aria-label="Weights in this file are in">
        <span class="unit-label">Weights in this file are in</span>
        <span class="unit-pills">
          <button v-for="u in UNITS" :key="u" type="button" role="radio" :aria-checked="fallbackUnit === u" :class="{ on: fallbackUnit === u }" @click="fallbackUnit = u">
            {{ u }}
          </button>
        </span>
      </div>
      <div v-if="warmups > 0" class="toggle-row">
        <span class="toggle-text">
          <span id="import-warmups" class="toggle-title">Keep warm-up sets</span>
          <span class="toggle-caption">{{ warmups.toLocaleString() }} in this file. Off: they're left out, so they don't count as records.</span>
        </span>
        <button
          type="button"
          class="switch"
          :class="{ on: includeWarmups }"
          role="switch"
          :aria-checked="includeWarmups"
          aria-labelledby="import-warmups"
          @click="includeWarmups = !includeWarmups"
        >
          <span class="knob" aria-hidden="true"></span>
        </button>
      </div>
      <div class="info">
        {{ plan.workouts > 0 ? 'Adds to your history. Nothing is deleted. RPE and notes come along; each workout\'s name goes in its note.' : 'Everything in this file is already here. Nothing to add.' }}
      </div>
      <p v-if="importError" class="error" role="alert">{{ importError }}</p>
      <button type="button" class="primary" :disabled="importing || plan.workouts === 0" @click="runImport">
        {{ importing ? 'Importing…' : `Import ${plural(plan.workouts, 'workout')}` }}
      </button>
      <button type="button" class="ghost" :disabled="importing" @click="back">Back to exercises</button>
    </template>
  </div>

  <div v-if="otherRow" class="other-layer" @click.self="otherRow = null">
    <div class="sheet other-sheet" role="dialog" aria-modal="true" :aria-label="`Match ${otherRow.source.name}`">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-header">
        <div class="other-head">
          <h3 class="sheet-title">{{ otherRow.source.name }}</h3>
          <span class="opt-sub">{{ sourceSetCount(otherRow) }} in your {{ appInfo.label }} file</span>
        </div>
        <button type="button" class="sheet-icon" aria-label="Close" @click="otherRow = null">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <input v-model="query" type="search" class="search" placeholder="Search exercises" aria-label="Search exercises" />
      <template v-if="sheetMine.length">
        <p class="sec">Your exercises</p>
        <button v-for="c in sheetMine" :key="`m-${c.kind === 'mine' ? c.exercise.id : ''}`" type="button" class="opt" @click="pickCandidate(c)">
          <span class="guess-text">
            <span class="opt-name">{{ candidateName(c) }}</span>
            <span class="opt-sub">{{ candidateSubline(c, setCounts) }}</span>
          </span>
          <span class="tag yours">Yours</span>
        </button>
      </template>
      <template v-if="sheetLibrary.length">
        <p class="sec">From the library</p>
        <button v-for="c in sheetLibrary" :key="`l-${c.kind === 'library' ? c.entry.id : ''}`" type="button" class="opt" @click="pickCandidate(c)">
          <span class="guess-text">
            <span class="opt-name">{{ candidateName(c) }}</span>
            <span class="opt-sub">{{ candidateSubline(c, setCounts) }}</span>
          </span>
          <span class="tag lib">Library</span>
        </button>
      </template>
      <p v-if="searching && !sheetMine.length && !sheetLibrary.length" class="opt-sub">Nothing tracked the same way matches "{{ query.trim() }}".</p>
      <button type="button" class="opt addnew" @click="pickNew">
        <span class="guess-text">
          <span class="opt-name">Add as new exercise</span>
          <span class="opt-sub">{{ capitalized(TRACKING[otherRow.source.loadType]) }} · keeps the name "{{ otherRow.source.name }}"</span>
        </span>
        <span class="tag new">New</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  position: relative;
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

.sheet.has-dock {
  padding-bottom: 0;
}

.sheet-handle {
  align-self: center;
  flex-shrink: 0;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sheet-title {
  flex: 1;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.sheet-icon {
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

.lede,
.soon {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.soon {
  margin-top: -4px;
  font-size: 0.76rem;
}

.apps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.app {
  min-height: auto;
  padding: 14px 12px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  text-align: left;
  color: var(--text);
}

.app.sel {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.app-name {
  font-weight: 800;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-sub {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-dim);
}

.radio {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border);
  display: grid;
  place-items: center;
}

.radio.on {
  border-color: var(--accent);
}

.radio.on::after {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent);
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
}

.sec {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.card .sec {
  margin-bottom: 8px;
}

.how {
  margin: 0;
  padding-left: 20px;
  list-style: decimal;
  font-size: 0.86rem;
  line-height: 1.55;
  color: var(--text);
}

.privacy,
.info {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--secondary) 45%, var(--border));
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text);
}

.privacy svg {
  color: var(--secondary);
  flex-shrink: 0;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.primary,
.ghost {
  width: 100%;
  min-height: 50px;
  border-radius: 14px;
  font-weight: 800;
  flex-shrink: 0;
}

.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.primary:disabled {
  background: transparent;
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  color: color-mix(in srgb, var(--accent) 55%, transparent);
  opacity: 1;
  cursor: not-allowed;
}

.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.8rem;
}

/* review */
.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--text-dim);
}

.bar {
  flex: 1;
  height: 6px;
  border-radius: 6px;
  background: var(--surface-2);
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: 6px;
  transition: width 0.2s;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  padding: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.row.done {
  padding: 10px 12px;
  background: var(--surface);
}

.src {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.src-name {
  font-weight: 800;
  font-size: 0.93rem;
  overflow-wrap: anywhere;
}

.src-meta {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-dim);
}

.guess,
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.guess {
  margin: 8px 0 10px;
}

.guess.none,
.opt.addnew {
  border-style: dashed;
}

.opt {
  width: 100%;
  min-height: auto;
  text-align: left;
  color: var(--text);
  font-weight: inherit;
  flex-shrink: 0;
}

.guess-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.opt-name {
  font-weight: 700;
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}

.opt-sub {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-dim);
}

.tag {
  margin-left: auto;
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.tag.yours {
  background: color-mix(in srgb, var(--success) 18%, transparent);
  color: var(--success);
}

.tag.lib {
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  color: var(--secondary);
}

.tag.new {
  background: color-mix(in srgb, var(--highlight) 18%, transparent);
  color: var(--highlight);
}

.acts {
  display: flex;
  gap: 8px;
}

.acts button {
  min-height: 44px;
  border-radius: 12px;
  font-weight: 800;
  font-size: 0.86rem;
}

.yes {
  flex: 1;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.other {
  padding: 0 14px;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
}

.ans {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
  font-size: 0.82rem;
  min-width: 0;
}

.ans b {
  font-weight: 800;
  overflow-wrap: anywhere;
}

.ans .tag {
  margin-left: 0;
}

.ok {
  color: var(--success);
  flex-shrink: 0;
}

.arrow {
  color: var(--text-dim);
}

.change {
  margin-left: auto;
  min-height: 32px;
  padding: 0 4px;
  background: transparent;
  border: none;
  color: var(--secondary);
  font-size: 0.76rem;
  font-weight: 800;
  flex-shrink: 0;
}

.dock {
  position: sticky;
  bottom: 0;
  margin: 0 -16px;
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  background: var(--bg);
  border-top: 1px solid var(--border);
}

.hintline {
  margin: 0 0 8px;
  text-align: center;
  font-size: 0.74rem;
  color: var(--text-dim);
}

/* Other… sheet */
.other-layer {
  position: fixed;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}

.other-sheet {
  gap: 8px;
}

.other-head {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.search {
  min-height: 44px;
  flex-shrink: 0;
}

.other-sheet .sec {
  margin-top: 6px;
}

/* confirm */
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
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--success) 18%, transparent);
  color: var(--success);
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
  font-size: 0.86rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.file-date {
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
}

.count span {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--text-dim);
}

.count.wide {
  grid-column: 1 / -1;
}

.unit-row,
.toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.unit-label {
  flex: 1;
  font-weight: 800;
  font-size: 0.9rem;
}

.unit-pills {
  display: flex;
  gap: 6px;
}

.unit-pills button {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
  font-weight: 800;
}

.unit-pills button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.toggle-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.toggle-title {
  font-weight: 800;
  font-size: 0.9rem;
}

.toggle-caption {
  margin-top: 2px;
  font-size: 0.76rem;
  line-height: 1.35;
  color: var(--text-dim);
}

.switch {
  position: relative;
  width: 46px;
  height: 28px;
  min-height: auto;
  padding: 0;
  margin-left: auto;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.switch .knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: left 0.15s;
}

.switch.on {
  background: var(--accent);
  border-color: var(--accent);
}

.switch.on .knob {
  left: 21px;
  background: var(--accent-text);
}

/* done */
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
</style>
