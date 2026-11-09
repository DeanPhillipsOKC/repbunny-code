<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import { useRestStore } from '../stores/rest'
import { useTemplatesStore } from '../stores/templates'
import { useWorkoutsStore } from '../stores/workouts'
import AddExerciseSheet from './AddExerciseSheet.vue'
import BodyStatsModal from './BodyStatsModal.vue'
import DayMark from './DayMark.vue'
import ExerciseFormSheet from './ExerciseFormSheet.vue'
import ExerciseHistoryDetail from './ExerciseHistoryDetail.vue'
import PageHeader from './PageHeader.vue'
import WhatsNewBanner from './WhatsNewBanner.vue'
import TrialEndBanner from './TrialEndBanner.vue'
import RecordCelebration from './RecordCelebration.vue'
import RestTimer from './RestTimer.vue'
import SmallWinChip from './SmallWinChip.vue'
import RestMiniBar from './RestMiniBar.vue'
import FinishRecap from './FinishRecap.vue'
import UnlockCelebration from './UnlockCelebration.vue'
import FinishEarlyDialog from './FinishEarlyDialog.vue'
import RoutinePicker from './RoutinePicker.vue'
import PlateCalculatorSheet from './PlateCalculatorSheet.vue'
import SetupNotesSheet from './SetupNotesSheet.vue'
import SetStopwatch from './SetStopwatch.vue'
import WeightTypoWarning from './WeightTypoWarning.vue'
import ExerciseSwapSheet from './ExerciseSwapSheet.vue'
import type { SwapOption } from '../lib/exerciseSwap'
import { barWeight, usesBarbell } from '../lib/plates'
import { findLibraryMatch, libraryEntry } from '../lib/exerciseLibrary'
import { convertsOneSided, liftForExercise, strengthSex } from '../lib/strengthLevels'
import { bestEstimate, markStartSexAsked, pickStartingWeight, startSexAsked, type RelatedLift, type StartingWeight } from '../lib/startingWeight'
import { buildWarmup, type WarmupEquipment, type WarmupLoad, type WarmupSet } from '../lib/warmup'
import StrengthSexPicker from './StrengthSexPicker.vue'
import { buildRepRecords, formatWeight, progressionFor } from '../lib/repRecords'
import { topWin, visibleWins, type SmallWin, type WinTarget } from '../lib/smallWins'
import { recordCelebrations } from '../lib/recordCelebrations'
import { buildSetTargets, buildSmartTarget, decideLighterWeek, fillOpenRows, formatTarget, lighterWeekDecisions, targetsOffIds, type SetTarget } from '../lib/smartTarget'
import { flatSince } from '../lib/plateau'
import { FREE_TEMPLATE_LIMIT, hasPremium, isPremium, openPremiumSheet, showPremiumNudges } from '../lib/premium'
import { milestoneMomentsOn } from '../lib/milestones'
import { restLine, rewardForTier } from '../lib/extras'
import { pendingWidgetStart } from '../lib/homeWidgets'
import { pendingSetupStart, setupStartPicked } from '../lib/setupWizard'
import { formatSetLabel } from '../lib/setLabel'
import { formatDurationDigits, formatSecondsAsClock, parseDurationLabel } from '../lib/timedInput'
import { accountSheetOpen, openAccountSheet } from '../lib/accountSheet'
import { convertSetWeight, isWeighInReminderDue, needsMissingBodyWeightPrompt } from '../lib/bodyStats'
import { primeRestChimeAudio } from '../lib/restChime'
import { checkSetEntry, heaviestWeight, isCheckConstraintError, SET_EDIT_FAILED_MESSAGE } from '../lib/setValidation'
import { suggestTemplateName, templateRowsFromSets } from '../lib/templateFromWorkout'
import { routineChangeParts, routineChanges, type RoutineChange } from '../lib/routineUpdate'
import { feelOf, type WorkoutFeel } from '../lib/workoutFeel'
import { buildWorkoutEvents } from '../lib/workoutEvents'
import type { SetMarker } from '../lib/progress'
import type { DistanceUnit, Exercise, LoadType, SetEntry, SetWithExercise, WeightUnit } from '../lib/types'

const exercises = useExercisesStore()
const rest = useRestStore()
const templates = useTemplatesStore()
const workout = useWorkoutsStore()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()
const router = useRouter()

// Backlog item 26: pre-start guidance points a brand-new account at the
// Exercises/Templates tabs — routed directly rather than bubbled up through
// an emit, now that App.vue no longer owns a `view` ref to switch (router.ts).

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Backlog item 1 (template-or-freeform choice): `null` is the sentinel for
// "nothing picked yet", distinct from `''` which means Freeform was
// explicitly chosen — without that distinction, an untouched start screen
// looked identical to a deliberate Freeform pick and "Start workout" would
// silently start freeform.
const templateId = ref<string | null>(null)
const exerciseId = computed({
  get: () => {
    const ids = workoutExerciseIds.value
    return ids.includes(workout.activeExerciseId) ? workout.activeExerciseId : (ids[0] ?? '')
  },
  set: (id: string) => { workout.activeExerciseId = id },
})
const errorMessage = ref('')

// Backlog item 78: missing-body-weight prompt shown when the active workout's
// selected exercise is bodyweight/assisted and no body weight is on file
// yet. `showMissingWeightModal` is the modal's own open/closed state;
// `missingWeightPromptSuppressedThisWorkout` implements "Not now" suppressing
// it for the rest of *this* workout (reset in handleStart/handleResume below,
// per docs/backlog.md item 78 — it comes back next workout).
const showMissingWeightModal = ref(false)
const missingWeightPromptSuppressedThisWorkout = ref(false)

function maybePromptForMissingWeight(id: string) {
  if (missingWeightPromptSuppressedThisWorkout.value) return
  if (needsMissingBodyWeightPrompt(loadTypeFor(id), bodyWeight.latestEntry !== null, profile.missingWeightPromptOptOut)) {
    showMissingWeightModal.value = true
  }
}

async function handleMissingWeightSave(payload: { weight: number; weightUnit: WeightUnit }) {
  await bodyWeight.logWeight(payload.weight, payload.weightUnit)
  showMissingWeightModal.value = false
}

function handleMissingWeightDismiss() {
  missingWeightPromptSuppressedThisWorkout.value = true
  showMissingWeightModal.value = false
}

async function handleMissingWeightOptOut() {
  await profile.updateMissingWeightPromptOptOut(true)
  showMissingWeightModal.value = false
}

// Backlog item 80: periodic "update your weight" reminder, checked once on
// Home open (see onMounted below) rather than on every mount of this
// component — a workout in progress uses this same route/component, so
// checking only after the profile/body-weight fetches resolve and skipping
// while a workout is active or being offered for recovery is what keeps this
// from firing mid-session (docs/backlog.md item 80's "never interrupt an
// in-progress workout"). The snooze from "Not now" is per-device localStorage
// (item 80's own call, not account state) — wrapped in try/catch since a
// private-browsing/storage-blocked failure should just mean it asks again
// sooner, never a broken Home screen.
const WEIGH_IN_REMINDER_SNOOZE_KEY = 'repbunny-weigh-in-reminder-snooze-until'
const WEIGH_IN_REMINDER_SNOOZE_DAYS = 3
const showWeighInReminderModal = ref(false)

function getWeighInReminderSnoozeUntil(): number | null {
  try {
    const raw = localStorage.getItem(WEIGH_IN_REMINDER_SNOOZE_KEY)
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}

function snoozeWeighInReminder() {
  try {
    localStorage.setItem(
      WEIGH_IN_REMINDER_SNOOZE_KEY,
      String(Date.now() + WEIGH_IN_REMINDER_SNOOZE_DAYS * 24 * 60 * 60 * 1000),
    )
  } catch {
    // best-effort snooze; worst case it just asks again sooner
  }
}

function maybeShowWeighInReminder() {
  if (workout.activeWorkoutId || workout.recoverableWorkout) return
  if (
    isWeighInReminderDue({
      latestEntryRecordedAt: bodyWeight.latestEntry?.recorded_at ?? null,
      cadence: profile.weightReminder,
      hasHeight: profile.height !== null,
      snoozedUntil: getWeighInReminderSnoozeUntil(),
      now: Date.now(),
    })
  ) {
    showWeighInReminderModal.value = true
  }
}

async function handleWeighInReminderSave(payload: { weight: number; weightUnit: WeightUnit }) {
  await bodyWeight.logWeight(payload.weight, payload.weightUnit)
  showWeighInReminderModal.value = false
}

function handleWeighInReminderDismiss() {
  snoozeWeighInReminder()
  showWeighInReminderModal.value = false
}

async function handleWeighInReminderOptOut() {
  await profile.updateWeightReminder('off')
  showWeighInReminderModal.value = false
}

// Backlog item 38: full-screen celebration takeover when a set beats the
// all-time best for that exercise, replacing the old auto-dismissing
// bottom toast (docs/backlog-archive.md item 4) — requires an explicit
// dismiss (RecordCelebration.vue) rather than fading on its own.
const recordCelebration = ref<{
  exerciseId: string
  reps: number
  weight: number
  weightUnit: WeightUnit
  level: number | null
  loadType: LoadType
  effectiveLoad: number | null
  previousBest: SetMarker
  firstEver: boolean
  win?: SmallWin | null
} | null>(null)

// addSet's record check runs in the background (see workouts.ts) so it
// never delays the add; react to it landing whenever it does.
watch(
  () => workout.newRecord,
  (record) => {
    if (record) recordCelebration.value = record
  },
)

// Issue #476: with Record celebrations on "All wins", a small win opens the
// same screen, for its strongest visible win. A record already up wins.
watch(
  () => workout.newSmallWin,
  (found) => {
    if (!found || recordCelebrations.value !== 'all' || recordCelebration.value) return
    const win = topWin(found.wins, hasPremium('progress'))
    if (!win) return
    const { exerciseId, reps, weight, weightUnit, level, loadType } = found
    const previousBest: SetMarker = { loadType, level, reps, weight, weightUnit, effectiveLoad: null }
    recordCelebration.value = { exerciseId, reps, weight, weightUnit, level, loadType, effectiveLoad: null, previousBest, firstEver: false, win }
  },
)

onMounted(() => {
  if (exercises.exercises.length === 0) exercises.fetchExercises()
  if (templates.templates.length === 0) templates.fetchTemplates()
  // Backlog item 78: the missing-body-weight prompt needs to know whether a
  // weight is already on file and whether the user opted out, before the
  // first bodyweight/assisted exercise gets selected. Item 80's periodic
  // reminder check waits on both of these (plus checkForRecoverableWorkout,
  // fired from App.vue around the same time this mounts) before
  // deciding whether it's due, rather than racing them.
  const profileReady = profile.fetched ? Promise.resolve() : profile.fetchProfile()
  const bodyWeightReady = bodyWeight.fetched ? Promise.resolve() : bodyWeight.fetchEntries()
  Promise.all([profileReady, bodyWeightReady]).then(maybeShowWeighInReminder)
  workout.fetchProgressStats()
  workout.fetchRecentlyLoggedExercises()
  if (pendingAdvance.value && !activeRest.value) runPendingAdvance()
  elapsedTimerHandle = window.setInterval(() => {
    elapsedNow.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  // Issue #80: the rest keeps going in App.vue's bar on the other tabs.
  if (activeRest.value) restMinimized.value = true
  if (elapsedTimerHandle !== null) window.clearInterval(elapsedTimerHandle)
  clearTimeout(advanceTimeout)
  clearTimeout(autoFinishTimeout)
})

// Backlog item 50: dynamic header while a workout is active — template name
// (or "Freeform workout") plus a running elapsed-time clock, replacing the
// heading that used to read "Log a workout" throughout. `elapsedNow` ticks
// once a second purely to keep `elapsedLabel` reactive; the real source of
// truth is `activeWorkoutStartedAt` (stores/workouts.ts), set when the
// workout row is created.
const elapsedNow = ref(Date.now())
let elapsedTimerHandle: number | null = null

const activeTemplateName = computed(() => {
  if (!workout.activeTemplateId) return null
  return templates.templates.find((t) => t.id === workout.activeTemplateId)?.name ?? null
})

const headerTitle = computed(() => {
  if (!workout.activeWorkoutId) return 'Log a workout'
  return activeTemplateName.value ?? 'Freeform workout'
})

const elapsedLabel = computed(() => {
  if (!workout.activeWorkoutId || !workout.activeWorkoutStartedAt) return null
  const totalSeconds = Math.max(0, Math.floor((elapsedNow.value - workout.activeWorkoutStartedAt) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`
})

// Backlog item 3: sets from the previous workout against this template,
// grouped by exercise in the order they were logged, so the reps/weight
// pre-fill (item 21's applyPrefillToRow below) can read off it. Used to also
// back a "Last time" summary card; removed in the redesign (item 67) since
// the per-row pre-fill already surfaces the same numbers.
const previousSetsByExercise = computed(() => {
  const grouped: Record<string, SetWithExercise[]> = {}
  for (const set of workout.previousWorkout?.sets ?? []) {
    ;(grouped[set.exercise_id] ??= []).push(set)
  }
  return grouped
})

// Backlog item 25: a template can still reference an exercise after it's
// been archived (archiving only flips exercises.is_archived, it doesn't
// touch workout_template_exercises), so this filters archived exercises out
// of the carousel deck below rather than treating the join table as the
// source of truth for what's loggable. Checks the live
// exercises store rather than te.exercises.is_archived from the cached join
// — that join is a snapshot from whenever the template's exercises were
// last fetched, which templates.exercisesByTemplate only ever does once per
// template per session, so it goes stale the moment an exercise still
// showing in it gets archived later in the same session.
// Issue #150: a swapped exercise takes the original's place and its remaining
// planned sets, for this workout only.
const activeTemplateExercises = computed(() => {
  if (!workout.activeTemplateId) return []
  return (templates.exercisesByTemplate[workout.activeTemplateId] ?? [])
    .filter((te) => !exercises.exercises.find((e) => e.id === te.exercise_id)?.is_archived)
    .map((te) => {
      const swap = swappedExercises.value[te.exercise_id]
      return swap ? { ...te, exercise_id: swap.to, target_sets: swap.targetSets } : te
    })
})

// Redesign item 67: the swipeable carousel's deck of exercises for the
// active workout, replacing the old chip row + <select> (which item 21
// scoped a templated workout's dropdown to the template's own exercises).
// That auto-populated part of the deck stays template-scoped for the same
// reason item 21 gave (an ad-hoc addition leaking into the "last time"/
// volume-chart reporting) — but the carousel's persistent "+" now
// deliberately allows adding any active exercise on top of it (an ad-hoc
// addition, or the whole deck for a freeform workout), per the redesign's
// canvas note: "for anything outside the template or building a freeform
// session from scratch." adHocExerciseIds tracks those additions for this
// session (held in the workout store across Home tab navigation); the fallback
// over activeSets covers a resumed workout whose ad-hoc addition was made in
// an earlier session and so never repopulated adHocExerciseIds.
const adHocExerciseIds = toRef(workout, 'adHocExerciseIds')
const swappedExercises = toRef(workout, 'swappedExercises')
const swapRestSource = toRef(workout, 'swapRestSource')

const workoutExerciseIds = computed(() => {
  const ids: string[] = []
  const seen = new Set<string>()
  function add(id: string) {
    if (seen.has(id) || !exercises.exercises.some((exercise) => exercise.id === id)) return
    seen.add(id)
    ids.push(id)
  }
  for (const te of activeTemplateExercises.value) add(te.exercise_id)
  for (const id of adHocExerciseIds.value) add(id)
  for (const set of workout.activeSets) add(set.exercise_id)
  return ids
})

const currentExerciseIndex = computed(() => workoutExerciseIds.value.indexOf(exerciseId.value))

// Drives which way the exercise-card transition below slides -- 1 for
// forward (dot/swipe/next moving to a later position in the deck), -1 for
// backward. Computed here rather than separately in each caller (dots,
// peek buttons, swipe, the add-exercise sheet) since they all funnel
// through this one function.
const slideDirection = ref(1)

function selectExercise(id: string) {
  const newIndex = workoutExerciseIds.value.indexOf(id)
  const oldIndex = currentExerciseIndex.value
  if (newIndex !== -1 && oldIndex !== -1) slideDirection.value = newIndex >= oldIndex ? 1 : -1
  exerciseId.value = id
}

// Redesign item 67 follow-up: the set-rows panel (unit toggle + set rows +
// "Add row") now gets the same crossing slide as the exercise card (see
// handleCardLeaveStart below) instead of animating in place, so both areas
// read as one thing moving together. A first attempt animated the rows in
// place without remounting, specifically to avoid a keyed <Transition>
// briefly mounting two copies of the same live, editable "Reps"/"Weight"
// fields — but that read as noticeably less connected to the card's own
// crossing motion once the card got upgraded, so this now takes on the same
// real-crossing risk the card already handles: `handleSetRowsLeaveStart`
// neutralizes the outgoing copy the instant its leave starts -- aria-hidden
// (removes it from getByRole/getByLabel-based queries and screen readers),
// pointer-events: none (stops a real tap from landing on it), and stripping
// the two state classes (`.set-row-draft`/`.set-row-logged`) e2e specs
// query by raw CSS selector.
//
// Unlike the card, this panel has no fixed height (row count varies by
// exercise), so both the outgoing and incoming copies going `position:
// absolute` for the crossing would otherwise leave the surrounding .card
// with nothing in-flow to size itself against, collapsing it to zero height
// for the transition's duration and snapping everything below it (the
// Finish button, etc.) up and back down. before-enter/before-leave lock the
// viewport to whichever of the two heights is taller for the transition,
// and after-enter releases it back to auto once the incoming panel is the
// only one left.
const setRowsViewportEl = ref<HTMLElement | null>(null)

function lockSetRowsViewportHeight(el: Element) {
  const viewport = setRowsViewportEl.value
  if (!viewport) return
  const height = (el as HTMLElement).offsetHeight
  const current = parseFloat(viewport.style.height || '0')
  viewport.style.height = `${Math.max(height, current)}px`
}

function handleSetRowsBeforeEnter(el: Element) {
  lockSetRowsViewportHeight(el)
}

function handleSetRowsBeforeLeave(el: Element) {
  lockSetRowsViewportHeight(el)
}

function handleSetRowsAfterEnter() {
  const viewport = setRowsViewportEl.value
  if (viewport) viewport.style.height = ''
}

function handleSetRowsLeaveStart(el: Element) {
  el.setAttribute('aria-hidden', 'true')
  ;(el as HTMLElement).style.pointerEvents = 'none'
  // aria-hidden alone isn't a reliable-enough guard here: Chromium's
  // accessibility tree (which getByRole/getByLabel query through) doesn't
  // necessarily reflect an attribute change synchronously, so a query
  // issued right after this fires can still resolve the leaving copy's
  // "Reps"/"Weight"/etc. field alongside the incoming one's (confirmed by
  // a real strict-mode-violation failure here, not just theoretical).
  // Directly destroying what each query actually matches on is immediate
  // and doesn't depend on that timing: clearing the sr-only label text
  // severs getByLabel's implicit-label association, and removing
  // aria-label does the same for getByRole's accessible-name lookup on the
  // remove/log buttons.
  el.querySelectorAll('.sr-only').forEach((node) => {
    node.textContent = ''
  })
  el.querySelectorAll('[aria-label]').forEach((node) => {
    node.removeAttribute('aria-label')
  })
  el.querySelectorAll('.set-row-draft, .set-row-logged, .set-row-editing').forEach((node) => {
    node.classList.remove('set-row-draft', 'set-row-logged', 'set-row-editing')
  })
}

function goToDeckOffset(delta: number) {
  const ids = workoutExerciseIds.value
  if (ids.length === 0) return
  const current = currentExerciseIndex.value
  const next = current === -1 ? 0 : Math.min(Math.max(current + delta, 0), ids.length - 1)
  selectExercise(ids[next])
}

function goToPreviousExercise() {
  goToDeckOffset(-1)
}

function goToNextExercise() {
  goToDeckOffset(1)
}

// Real swipe support (not just the peek buttons/dots). Bound on the whole
// active-workout screen (not just the exercise card) per the redesign
// follow-up -- a swipe starting anywhere over the set rows, notes, etc.
// still moves the carousel, not just a drag confined to the small card.
//
// Touch uses touchstart/touchend rather than pointer events. A pointer
// stream gets a pointercancel (and never a pointerup) the moment the browser
// claims the gesture as a vertical scroll, which a slightly diagonal thumb
// swipe often triggers, so those swipes were silently dropped. Touch events
// keep reporting through a scroll, and touchend's changedTouches still carry
// the finger's final position. A swipe may also start on a reps/weight
// field or a button (most of the set card): nothing is captured, so a plain
// tap on those still focuses/clicks normally, and a moved touch never
// produces a click. Mouse/pen keep pointer events, with the release listened
// for on window so a drag that ends off this element still counts.
//
// The screen's `touch-action: pan-y` (below) stops the browser from treating
// a horizontal drag as its own scroll/navigation gesture while still letting
// a vertical drag scroll the page normally.
let dragStart: { x: number; y: number } | null = null

function beginSwipe(x: number, y: number) {
  // Nothing to swipe between with zero or one exercise in the deck.
  dragStart = workoutExerciseIds.value.length < 2 ? null : { x, y }
}

function endSwipe(x: number, y: number) {
  if (dragStart === null) return
  const dx = x - dragStart.x
  const dy = y - dragStart.y
  dragStart = null
  // Mostly-vertical movement is a scroll, not a swipe.
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
  if (dx > 0) goToPreviousExercise()
  else goToNextExercise()
}

function handleWorkoutTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1) {
    dragStart = null
    return
  }
  beginSwipe(event.touches[0].clientX, event.touches[0].clientY)
}

function handleWorkoutTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (touch) endSwipe(touch.clientX, touch.clientY)
}

function handleWorkoutTouchCancel() {
  dragStart = null
}

function handleWorkoutPointerDown(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  // With a mouse, a drag from a field or button is selecting text or
  // pressing that control, not swiping.
  if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return
  beginSwipe(event.clientX, event.clientY)
  window.addEventListener('pointerup', (up) => endSwipe(up.clientX, up.clientY), { once: true })
}

// The crossing-slide Transition below (no `mode="out-in"`) briefly mounts
// two `.exercise-card`s at once -- the outgoing one sliding out while the
// incoming one slides in. Both render the same content shape (name,
// position, "View exercise history" button, etc.), which would otherwise
// give assistive tech and any test querying by role/class two matches for
// the same thing for the animation's duration. The outgoing copy is inert
// visual chrome only by this point, so `@leave` (fired the instant Vue
// starts animating it out) marks it `aria-hidden` and strips the one class
// e2e specs query by CSS selector rather than role/label.
function handleCardLeaveStart(el: Element) {
  el.setAttribute('aria-hidden', 'true')
  ;(el as HTMLElement).style.pointerEvents = 'none'
  // See handleSetRowsLeaveStart's comment: aria-hidden alone isn't
  // reliably synchronous with Chromium's accessibility tree, so also
  // directly destroy what a role/text-content query would actually match
  // -- the class an e2e spec queries by raw CSS selector, and the "View
  // exercise history" button's text (its accessible name, since it has no
  // aria-label of its own).
  el.querySelector('.exercise-card-name')?.classList.remove('exercise-card-name')
  const historyLink = el.querySelector('.history-link')
  if (historyLink) historyLink.textContent = ''
  const notesLink = el.querySelector('.notes-link')
  notesLink?.removeAttribute('aria-label')
  notesLink?.removeAttribute('title')
}

// Add-exercise sheet: the deck's persistent "+". Candidates exclude whatever
// is already in the deck (picking one of those is what the dots are for).
const addingExercise = ref(false)

// Issue #43: the sheet stays open across picks. Each pick joins the deck
// right away; this session's picks stay listed in the sheet as "✓ Added"
// (so they can be un-picked) and the first one becomes current on close.
const sheetPicks = ref<string[]>([])

const candidateExercisesForSheet = computed(() =>
  exercises.activeExercises
    .filter((e) => !workoutExerciseIds.value.includes(e.id) || sheetPicks.value.includes(e.id))
    .map((e) => ({ id: e.id, name: e.name, muscle_group: e.muscle_group })),
)

const sheetPicksAdded = computed(() => Object.fromEntries(sheetPicks.value.map((id) => [id, null])))

// Issue #313: the first workout keeps the sheet open across picks too (#207
// had the first pick close it, which read as the workout starting before
// the user had picked everything they wanted).
function openAddExercise() {
  sheetPicks.value = []
  addingExercise.value = true
}

function handleSheetSelect(id: string) {
  if (!workoutExerciseIds.value.includes(id)) adHocExerciseIds.value.push(id)
  if (!sheetPicks.value.includes(id)) sheetPicks.value.push(id)
}

// Only a pick with no logged sets can come back out of the deck (a pick from
// this sheet session never has any, but guard anyway).
function handleSheetDeselect(id: string) {
  if (workout.activeSets.some((set) => set.exercise_id === id)) return
  sheetPicks.value = sheetPicks.value.filter((pick) => pick !== id)
  adHocExerciseIds.value = adHocExerciseIds.value.filter((adHoc) => adHoc !== id)
}

function closeAddExercise() {
  addingExercise.value = false
  const first = sheetPicks.value[0]
  sheetPicks.value = []
  if (first) selectExercise(first)
}

function handleSheetManage() {
  closeAddExercise()
  router.push({ name: 'exercises' })
}

// Issue #207: the welcome card's three ways in. Start a workout starts a
// freeform one with the Add exercise sheet open; Build a routine names it
// here and goes on to the editor (its Add exercise sheet open, as #6 does);
// Start from a program opens Templates at the starter programs.
async function startFirstWorkout() {
  await startWith('')
  if (workout.activeWorkoutId) openAddExercise()
}

const newTemplateOpen = ref(false)
const newTemplateName = ref('')
const newTemplateError = ref('')
// Issue #399: from the setup wizard's "Create my own program", the editor
// then offers "Add another routine" and "Done".
const newTemplateForProgram = ref(false)

async function openWelcomeTemplate(forProgram = false) {
  newTemplateForProgram.value = forProgram
  if (!(await templates.canCreateTemplate())) {
    openPremiumSheet('templates')
    return
  }
  newTemplateName.value = ''
  newTemplateError.value = ''
  newTemplateOpen.value = true
}

async function createWelcomeTemplate() {
  newTemplateError.value = ''
  const { data, error } = await templates.createTemplate(newTemplateName.value)
  if (error || !data) {
    newTemplateError.value = error?.message ?? 'Could not create routine.'
    return
  }
  newTemplateOpen.value = false
  const query: Record<string, string> = { add: '1' }
  if (newTemplateForProgram.value) query.program = '1'
  router.push({ name: 'template-edit', params: { id: data.id }, query })
}

// Issue #418: the note after adding a starter program from first run.
const programWelcomeShown = computed(
  () => !!templates.programWelcome && templates.activeTemplates.some((t) => t.id === templates.programWelcome?.firstTemplateId),
)

function openStarterPrograms() {
  router.push({ name: 'templates', query: { programs: '1' } })
}

// Issue #207: after a freeform workout the recap offers to save it as a
// routine, named for what it trained (it replaced a generic "Create a
// template" hint on Home). Issue #316: every freeform finish offers it while
// a routine slot is free (always with Premium); at the free limit it stays
// quiet. "Not now" hides it for this recap, "Don't ask again" for good on
// this device.
const SAVE_OFFER_DISMISSED_KEY = 'repbunny-save-template-offer-dismissed'

function readSaveOfferDismissed(): boolean {
  try {
    return localStorage.getItem(SAVE_OFFER_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

const saveOfferDismissed = ref(readSaveOfferDismissed())
const saveOfferHiddenFor = ref('')
const saveOfferName = ref('')
const saveOfferError = ref('')
const saveOfferSaving = ref(false)
const saveOfferSavedName = ref('')

const saveOfferWorkout = computed(() => {
  const finished = workout.justFinishedWorkout
  if (!finished || finished.template_id || finished.sets.length === 0) return null
  return finished
})

const showSaveOffer = computed(
  () =>
    !!saveOfferWorkout.value &&
    !saveOfferDismissed.value &&
    saveOfferHiddenFor.value !== saveOfferWorkout.value?.id &&
    !saveOfferSavedName.value &&
    templates.fetched &&
    (isPremium.value || templates.activeTemplates.length < FREE_TEMPLATE_LIMIT),
)

watch(
  () => saveOfferWorkout.value?.id,
  () => {
    const finished = saveOfferWorkout.value
    saveOfferSavedName.value = ''
    saveOfferError.value = ''
    saveOfferName.value = finished
      ? suggestTemplateName(
          finished.sets.map((set) => exercises.exercises.find((e) => e.id === set.exercise_id)?.muscle_group),
          finished.performed_at,
        )
      : ''
  },
  { immediate: true },
)

function hideSaveOfferOnce() {
  saveOfferHiddenFor.value = saveOfferWorkout.value?.id ?? ''
}

function dismissSaveOffer() {
  saveOfferDismissed.value = true
  try {
    localStorage.setItem(SAVE_OFFER_DISMISSED_KEY, 'true')
  } catch {
    // best-effort; it stays hidden for this session
  }
}

async function saveOfferAsTemplate() {
  const finished = saveOfferWorkout.value
  const name = saveOfferName.value.trim()
  if (!finished || !name || saveOfferSaving.value) return
  if (!(await templates.canCreateTemplate())) {
    openPremiumSheet('templates')
    return
  }
  saveOfferSaving.value = true
  saveOfferError.value = ''
  const rows = templateRowsFromSets(finished.sets, (id) => !!exercises.exercises.find((e) => e.id === id)?.is_archived)
  const { error } = await templates.createTemplateFromWorkout(name, rows)
  saveOfferSaving.value = false
  if (error) {
    saveOfferError.value = error.message
    return
  }
  saveOfferSavedName.value = name
}

// Issue #263: after a routine workout that strayed from its plan, the recap
// offers to carry the changes into the routine, one tickable line each.
// Nothing is written without "Update routine". "Not now" (or an update)
// hides it for that workout on this device, so a resume and refinish
// doesn't ask again.
const ROUTINE_UPDATE_DISMISSED_KEY = 'repbunny-routine-update-dismissed'

function readRoutineUpdateDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROUTINE_UPDATE_DISMISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

const routineUpdateDismissed = ref(readRoutineUpdateDismissed())
const routineUpdateChecked = ref<Record<string, boolean>>({})
const routineUpdateSaving = ref(false)
const routineUpdateError = ref('')
const routineUpdatedName = ref('')

const routineUpdateWorkout = computed(() => {
  const finished = workout.justFinishedWorkout
  if (!finished?.template_id || finished.sets.length === 0) return null
  return finished
})

// The routine as it stands now: gone or archived mid-workout means no offer.
const routineUpdateTemplate = computed(() => {
  const id = routineUpdateWorkout.value?.template_id
  const template = id ? templates.templates.find((t) => t.id === id) : undefined
  return template && !template.is_archived ? template : null
})

const routineUpdateChanges = computed<RoutineChange[]>(() => {
  const finished = routineUpdateWorkout.value
  const template = routineUpdateTemplate.value
  const plan = template ? templates.exercisesByTemplate[template.id] : undefined
  if (!finished || !plan) return []
  return routineChanges(
    plan,
    finished.sets,
    workout.finishSwaps,
    (id) => !!exercises.exercises.find((e) => e.id === id)?.is_archived,
  )
})

const showRoutineUpdate = computed(
  () =>
    !!routineUpdateTemplate.value &&
    routineUpdateChanges.value.length > 0 &&
    !routineUpdatedName.value &&
    !routineUpdateDismissed.value.includes(routineUpdateWorkout.value?.id ?? ''),
)

const routineUpdateCheckedCount = computed(
  () => routineUpdateChanges.value.filter((change) => routineUpdateChecked.value[change.key]).length,
)

function routineExerciseName(exerciseId: string): string {
  const plan = routineUpdateTemplate.value ? templates.exercisesByTemplate[routineUpdateTemplate.value.id] : undefined
  return (
    exercises.exercises.find((e) => e.id === exerciseId)?.name ??
    plan?.find((te) => te.exercise_id === exerciseId)?.exercises?.name ??
    'Exercise'
  )
}

watch(
  () => routineUpdateWorkout.value?.id,
  () => {
    routineUpdatedName.value = ''
    routineUpdateError.value = ''
    const templateId = routineUpdateTemplate.value?.id
    if (templateId && !templates.exercisesByTemplate[templateId]) templates.fetchTemplateExercises(templateId)
  },
  { immediate: true },
)

// Ticks reset to each line's default whenever the list itself changes.
watch(
  () => routineUpdateChanges.value.map((change) => change.key).join('|'),
  () => {
    routineUpdateChecked.value = Object.fromEntries(
      routineUpdateChanges.value.map((change) => [change.key, change.defaultChecked]),
    )
  },
  { immediate: true },
)

function rememberRoutineUpdateHandled(workoutId: string) {
  const next = [...routineUpdateDismissed.value.filter((id) => id !== workoutId), workoutId].slice(-20)
  routineUpdateDismissed.value = next
  try {
    localStorage.setItem(ROUTINE_UPDATE_DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // best-effort; it stays hidden for this session
  }
}

function dismissRoutineUpdate() {
  const id = routineUpdateWorkout.value?.id
  if (id) rememberRoutineUpdateHandled(id)
}

async function applyRoutineUpdate() {
  const finished = routineUpdateWorkout.value
  const template = routineUpdateTemplate.value
  if (!finished || !template || routineUpdateSaving.value) return
  const picked = routineUpdateChanges.value.filter((change) => routineUpdateChecked.value[change.key])
  if (picked.length === 0) return
  routineUpdateSaving.value = true
  routineUpdateError.value = ''
  const name = template.name
  const { error } = await templates.applyRoutineChanges(template.id, picked)
  routineUpdateSaving.value = false
  if (error) {
    routineUpdateError.value = error.message
    return
  }
  rememberRoutineUpdateHandled(finished.id)
  routineUpdatedName.value = name
}

// Recover-interrupted-workout item: recoverableWorkout comes straight off
// the raw fetch in stores/workouts.ts (checkForRecoverableWorkout), so its
// template name reads off the embedded `workout_templates` join rather than
// the templates store — that store may not have loaded yet by the time this
// prompt can appear (it's populated on boot, before WorkoutLogger's own
// onMounted has necessarily run).
const confirmingDiscardRecovered = ref(false)

const recoverableTemplateName = computed(
  () => workout.recoverableWorkout?.workout_templates?.name ?? 'Freeform workout',
)

const recoverableStartedLabel = computed(() => {
  if (!workout.recoverableWorkout) return ''
  return new Date(workout.recoverableWorkout.performed_at).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
})

async function handleResume() {
  const recovered = workout.recoverableWorkout
  if (!recovered) return
  workout.resumeRecoverableWorkout()
  missingWeightPromptSuppressedThisWorkout.value = false
  templateId.value = recovered.template_id ?? ''
  adHocExerciseIds.value = []
  swappedExercises.value = {}
  swapRestSource.value = {}
  exerciseId.value = ''
  if (recovered.template_id) {
    await workout.fetchPreviousWorkout(recovered.template_id, recovered.id)
    if (!templates.exercisesByTemplate[recovered.template_id]) {
      await templates.fetchTemplateExercises(recovered.template_id)
    }
  }
  exerciseId.value = workoutExerciseIds.value[0] ?? ''
}

async function handleDiscardRecovered() {
  const { error } = await workout.discardRecoverableWorkout()
  if (error) {
    errorMessage.value = error.message
    return
  }
  confirmingDiscardRecovered.value = false
}

// Item 111: users kept stalling on the start screen (a "Template (optional)"
// chip row above a Start button that stayed disabled until a chip was
// picked). Tapping a workout tile now starts it directly; a wrong tap is
// undone with "Change workout" (see changeWorkout below), and notes moved to
// the post-finish recap. `starting` swallows a double tap while the insert
// is in flight.
const starting = ref(false)

async function startWith(id: string) {
  if (starting.value) return
  templates.programWelcome = null
  starting.value = true
  templateId.value = id
  try {
    await handleStart()
  } finally {
    starting.value = false
  }
}

// Issue #144: a tap on the Next workout widget lands here and starts that
// template, unless a workout is already going (or waiting to be resumed or
// recapped), which wins. Checked on mount and whenever a tap or the template
// list arrives.
function startFromWidget() {
  const id = pendingWidgetStart.value
  if (!id || !templates.fetched) return
  pendingWidgetStart.value = null
  if (workout.activeWorkoutId || workout.recoverableWorkout || workout.finishRecap) return
  if (templates.activeTemplates.some((t) => t.id === id)) startWith(id)
}

watch(() => [pendingWidgetStart.value, templates.fetched], startFromWidget)
onMounted(startFromWidget)

// Issue #399: the setup wizard's last step lands here with its pick, the
// same two the welcome card offers. A workout that's already going (a
// replay mid-workout) just gets the Add exercise sheet.
function startFromSetup() {
  const start = pendingSetupStart.value
  if (!start) return
  pendingSetupStart.value = null
  if (start === 'routine') {
    openWelcomeTemplate(true)
  } else if (workout.activeWorkoutId) {
    openAddExercise()
  } else if (!workout.recoverableWorkout && !workout.finishRecap) {
    startFirstWorkout()
  }
}

watch(pendingSetupStart, startFromSetup)
onMounted(startFromSetup)

// Issue #536: "Do this again" on Home repeats only the most recent workout, so
// it can't stand in for routines. Offered when that workout was freeform (or
// its routine is gone), since a live routine already starts it with one tap.
const repeatCandidate = computed(() => {
  const last = workout.history[0]
  if (!last || last.sets.length === 0) return null
  if (last.template_id && templates.activeTemplates.some((t) => t.id === last.template_id)) return null
  const counts = new Map<string, number>()
  for (const set of last.sets) counts.set(set.exercise_id, (counts.get(set.exercise_id) ?? 0) + 1)
  const ids = [...counts.keys()].filter((id) => exercises.activeExercises.some((e) => e.id === id))
  if (ids.length === 0) return null
  return {
    ids,
    counts: Object.fromEntries(ids.map((id) => [id, counts.get(id)!])),
    names: ids.map((id) => exercises.exercises.find((e) => e.id === id)?.name ?? '').join(', '),
    date: new Date(last.performed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }
})

watch(
  () => workout.activeWorkoutId,
  (id) => {
    if (!id) workout.fetchHistory()
  },
  { immediate: true },
)

async function startRepeat() {
  const plan = repeatCandidate.value
  if (!plan || starting.value) return
  await startWith('')
  if (!workout.activeWorkoutId) return
  workout.repeatSetCounts = plan.counts
  adHocExerciseIds.value = [...plan.ids]
  exerciseId.value = plan.ids[0]
}

async function handleStart() {
  if (templateId.value === null) return
  errorMessage.value = ''
  // A brand-new workout session starts with no drafts of its own — without
  // this, a leftover unsaved row from a just-finished workout (e.g. the
  // auto-replenished blank row after the last set of a no-target exercise)
  // would resurface the moment the same exercise is picked again.
  draftRowsByExercise.value = {}
  adHocExerciseIds.value = []
  swappedExercises.value = {}
  swapRestSource.value = {}
  missingWeightPromptSuppressedThisWorkout.value = false
  exerciseId.value = ''
  if (templateId.value) {
    await workout.fetchPreviousWorkout(templateId.value)
  }
  const { error } = await workout.startWorkout(null, templateId.value || null)
  if (error) {
    errorMessage.value = error.message
    return
  }
  if (templateId.value && !templates.exercisesByTemplate[templateId.value]) {
    await templates.fetchTemplateExercises(templateId.value)
  }
  // Redesign item 67: the carousel opens on the deck's first exercise
  // (template order, or the first ad-hoc addition for a freeform workout)
  // instead of requiring an explicit pick before anything shows.
  exerciseId.value = workoutExerciseIds.value[0] ?? ''
}

// Backlog item 1: numbered rows matching the exercise's configured set
// count, instead of one field that gets overwritten set after set. Each
// exercise keeps its own row list, keyed by exercise id, so switching away
// and back preserves whatever's still unsaved in it — and because each
// exercise's rows only ever get touched by its own selection/completion
// code below (not by a broad "any set was added" watcher), a superset
// partner's slow-arriving response can no longer stomp on this exercise's
// draft the way the old single-field pre-fill could (see
// docs/backlog-archive.md for that history).
interface DraftRow {
  key: string
  reps: number | null
  weight: number | null
  level: number | null
  rpe: number | null
  // Backlog item 93: a timed row's duration is typed as digits with the
  // colon auto-filled in (see lib/timedInput.ts) -- kept as the raw display
  // string here and parsed to seconds only when the row is completed.
  durationInput: string
  distance: number | null
  incline: number | null
  calories: number | null
  saving: boolean
  attempted: boolean
  error: string
  // Issue #336: checkSetEntry's result for the last tap. `notice` blocks the
  // save (shown in the error slot, but unlike `error` it isn't a failed
  // write, so no Retry state); `confirm` asks first, and `confirmed` skips
  // that question once "Log anyway" is tapped. Editing the row clears all three.
  notice: string
  confirm: string
  confirmed: boolean
}

function makeDraftRow(): DraftRow {
  return {
    key: crypto.randomUUID(),
    reps: null,
    weight: null,
    level: null,
    rpe: null,
    durationInput: '',
    distance: null,
    incline: null,
    calories: null,
    saving: false,
    attempted: false,
    error: '',
    notice: '',
    confirm: '',
    confirmed: false,
  }
}

// Shared across rows rather than per-row — a full-width unit selector on
// every row would eat most of the vertical space a compact grid is for.
const rowWeightUnit = ref<WeightUnit>(profile.defaultWeightUnit)
const rowDistanceUnit = ref<DistanceUnit>('mi')

const draftRowsByExercise = ref<Record<string, DraftRow[]>>({})

function configuredTargetFor(id: string): number | null {
  if (!workout.activeTemplateId) return null
  return activeTemplateExercises.value.find((te) => te.exercise_id === id)?.target_sets ?? null
}

function isTemplateExercise(id: string): boolean {
  return activeTemplateExercises.value.some((te) => te.exercise_id === id)
}

function loggedCountFor(id: string): number {
  return workout.activeSets.filter((s) => s.exercise_id === id).length
}

function setsLoggedLabel(id: string): string {
  const logged = loggedCountFor(id)
  const target = configuredTargetFor(id)
  const suffix = target !== null ? ` of ${target}` : ''
  const plural = logged === 1 && target === null ? '' : 's'
  return `${logged}${suffix} set${plural} logged`
}

// Copies one set from last time into a row.
function fillRowFromSet(row: DraftRow, set: SetWithExercise) {
  row.reps = set.reps
  row.weight = set.weight
  row.level = set.level
  row.rpe = set.rpe
  row.durationInput = set.duration_seconds !== null ? formatSecondsAsClock(set.duration_seconds) : ''
  row.distance = set.distance
  row.incline = set.incline
  row.calories = set.calories
}

// Position-indexed, same rule as the old applyPrefill: set N this session
// pre-fills from set N last time (not just "the last set logged"), since a
// superset's interleaved order would otherwise pre-fill from the wrong
// exercise's most recent set.
function applyPrefillToRow(row: DraftRow, id: string, position: number) {
  const matchingSet = previousSetsByExercise.value[id]?.[position]
  if (!matchingSet) {
    row.reps = null
    row.weight = null
    row.level = null
    row.rpe = null
    row.durationInput = ''
    row.distance = null
    row.incline = null
    row.calories = null
    return
  }
  fillRowFromSet(row, matchingSet)
}

// Lazily builds this exercise's row list the first time it's selected in
// the active workout: `target_sets` rows for a templated exercise (minus
// however many are already logged), or a single row if no count is
// configured. Later re-selections reuse whatever's already there instead of
// recomputing, so an in-progress but unsaved row survives switching to
// another exercise and back. Always seeds exactly one row for a no-target
// exercise regardless of loggedCount — in the normal continuous session this
// only ever runs at loggedCount 0 (completeRow's own auto-replenish handles
// every row after the first), but a resumed workout (recover-interrupted-
// workout item) can reach this on first selection with sets already logged
// last session, and still needs an open row to keep logging.
// Issue #183: item 88's fallback sets, kept so the rest line can compare a
// set with the same set last time.
const fallbackSetsByExercise: Record<string, SetWithExercise[]> = {}
watch(
  () => workout.activeWorkoutId,
  () => {
    for (const id of Object.keys(fallbackSetsByExercise)) delete fallbackSetsByExercise[id]
  },
)

async function ensureDraftRows(id: string) {
  if (draftRowsByExercise.value[id]) return
  const target = configuredTargetFor(id)
  const loggedCount = loggedCountFor(id)
  const repeatCount = workout.repeatSetCounts[id]
  const plannedCount =
    target !== null ? Math.max(target - loggedCount, 0) : repeatCount ? Math.max(repeatCount - loggedCount, 1) : 1
  const rows = Array.from({ length: plannedCount }, () => makeDraftRow())
  // Registered before the prefill below so a re-entrant call (another
  // watch(exerciseId) firing while item 88's fallback fetch is still in
  // flight) sees this exercise's rows already exist and no-ops, same as the
  // original synchronous guard above.
  draftRowsByExercise.value[id] = rows
  rows.forEach((row, i) => applyPrefillToRow(row, id, loggedCount + i))
  // Issue #53: with no set last time to copy, a new exercise starts in the
  // profile's default unit rather than whatever the previous exercise used.
  // The item 88 fallback below still overrides it if older history exists.
  rowWeightUnit.value = previousSetsByExercise.value[id]?.[loggedCount]?.weight_unit ?? profile.defaultWeightUnit
  const seedDistanceUnit = previousSetsByExercise.value[id]?.[loggedCount]?.distance_unit
  if (seedDistanceUnit) rowDistanceUnit.value = seedDistanceUnit

  // Backlog item 88: same-template previous-workout data always wins when it
  // exists. Only fall back to this exercise's own most-recent-any-workout
  // history (freeform or another template) when the template's last session
  // had nothing at all for it — including a freeform workout, which never
  // has same-template data to begin with.
  if (previousSetsByExercise.value[id]) return
  const fallback = await workout.fetchFallbackPreviousSets(id)
  if (fallback.length === 0) return
  fallbackSetsByExercise[id] = fallback
  const currentRows = draftRowsByExercise.value[id]
  if (!currentRows) return
  currentRows.forEach((row, i) => {
    // Skip a row the user already started filling in, or already saved,
    // while the fetch was in flight.
    if (row.reps !== null || row.durationInput !== '' || row.attempted) return
    const matchingSet = fallback[loggedCount + i]
    if (!matchingSet) return
    fillRowFromSet(row, matchingSet)
    if (i === 0) {
      rowWeightUnit.value = matchingSet.weight_unit
      if (matchingSet.distance_unit) rowDistanceUnit.value = matchingSet.distance_unit
    }
  })
}

const draftRows = computed(() => (exerciseId.value ? (draftRowsByExercise.value[exerciseId.value] ?? []) : []))

// Redesign item: tapping into a reps/weight/RPE field that already carries
// a value (a stepper adjustment, or pre-fill/carryover from the previous
// set) used to require manually repositioning the cursor before typing.
// Selecting the value on focus makes it a one-keystroke overwrite instead.
function selectInputText(event: FocusEvent) {
  ;(event.target as HTMLInputElement).select()
}

// Backlog item 1: the numbered grid shows every row for the selected
// exercise together — already-logged sets followed by the still-open draft
// rows. Item 103: a logged set being edited renders as an 'editing' row,
// which reuses the draft row's inputs bound to editRow (see startEditingSet)
// -- editing lives in the set card itself now that the workout-wide list
// below it is gone.
type CombinedRow =
  | { type: 'logged'; number: number; set: SetEntry }
  | { type: 'editing'; number: number; set: SetEntry; row: DraftRow }
  | { type: 'draft'; number: number; row: DraftRow }

const combinedRows = computed<CombinedRow[]>(() => {
  if (!exerciseId.value) return []
  const id = exerciseId.value
  const logged = workout.activeSets.filter((s) => s.exercise_id === id)
  const rows: CombinedRow[] = logged.map((set, i) =>
    set.id === editingSetId.value
      ? { type: 'editing', number: i + 1, set, row: editRow.value }
      : { type: 'logged', number: i + 1, set },
  )
  draftRows.value.forEach((row, i) => rows.push({ type: 'draft', number: logged.length + i + 1, row }))
  return rows
})

// The ✓ slot's action for an entry row: Save for a set being edited, Add set
// (or Retry) for a draft.
function submitRow(entry: Exclude<CombinedRow, { type: 'logged' }>) {
  if (entry.type === 'editing') saveSetEdit(entry.set.id, entry.set.exercise_id)
  else completeRow(exerciseId.value, entry.row)
}

function submitRowLabel(entry: Exclude<CombinedRow, { type: 'logged' }>): string {
  if (entry.row.saving) return 'Saving…'
  if (entry.type === 'editing') return `Save set ${entry.number}`
  return entry.row.error ? 'Retry' : 'Add set'
}

// A restored selection already has an ID on mount, so seed its editor then too.
watch(exerciseId, (id, previousId) => {
  if (previousId !== undefined) cancelEditingSet()
  if (!id) return
  ensureDraftRows(id)
  // Backlog item 78: "when they log the first bodyweight/assisted set of a
  // workout" — checked at selection time, before any row for it is even
  // completed, so the prompt is out of the way by the time the user taps
  // "Add set".
  maybePromptForMissingWeight(id)
}, { immediate: true })

// Backlog item 1: "allow more to be added" — a manual escape hatch for both
// directions (a templated exercise the user wants to over/under-run this
// time, or another round for a no-target exercise beyond its auto-replenish
// below).
function addDraftRow(id: string) {
  const rows = draftRowsByExercise.value[id] ?? (draftRowsByExercise.value[id] = [])
  const row = makeDraftRow()
  applyPrefillToRow(row, id, loggedCountFor(id) + rows.length)
  rows.push(row)
}

function removeDraftRow(id: string, row: DraftRow) {
  if (row.saving || row.error) return
  const rows = draftRowsByExercise.value[id]
  if (!rows) return
  const index = rows.indexOf(row)
  if (index !== -1) rows.splice(index, 1)
}

// Backlog item 28: the in-app rest screen (RestTimer.vue) shows the
// countdown/progress bar/skip option while the tab stays foregrounded; item
// 15's push (or #78's native alert) covers the background. Issue #80: the
// rest itself lives in stores/rest.ts so it survives leaving Home; this
// component starts, adjusts, and skips it there.
const { activeRest, minimized: restMinimized, pendingAdvance } = storeToRefs(rest)

// RestTimer.vue already vibrated and chimed when its countdown ran out.
function handleRestTimerFinish() {
  rest.finish(true)
}

function skipRest() {
  rest.skip()
}

// Issue #429: the rest screen's Edit / Set for links. The rest screen sits
// above every sheet, so it minimizes (the rest keeps counting in the bar)
// while the exercise form or Account is open, and comes back when that
// closes, if the rest is still going.
const restEditExercise = ref<Exercise | null>(null)
let restoreRestOnClose = false

async function stepAwayFromRest(): Promise<boolean> {
  await rest.minimize()
  if (!restMinimized.value) return false
  restoreRestOnClose = true
  return true
}

async function editExerciseRestFromRest(exerciseId: string) {
  const exercise = exercises.exercises.find((e) => e.id === exerciseId)
  if (!exercise || !(await stepAwayFromRest())) return
  restEditExercise.value = exercise
}

async function editDefaultRestFromRest() {
  if (!(await stepAwayFromRest())) return
  openAccountSheet('rest')
}

watch([accountSheetOpen, restEditExercise], ([accountOpen, editing]) => {
  if (accountOpen || editing || !restoreRestOnClose) return
  restoreRestOnClose = false
  if (activeRest.value) restMinimized.value = false
})

// However a rest ends (Skip, the full screen running out, or the bar
// running out), the deck's pending advance takes it from there. One that
// ended off Home is picked up in onMounted.
watch(activeRest, (now, before) => {
  if (!now && before) runPendingAdvance()
})

// Backlog item 104: in a templated workout, once an exercise's planned sets
// (target_sets) are all logged, move the deck on to the next exercise that
// still has unlogged planned sets -- after that set's rest ends or is
// skipped, or ~1.5s later (with an "Up next" toast) when no rest is
// configured. A legacy template exercise without a target counts as
// unfinished until its first set is logged, so it can still be reached;
// after that first set it remains open-ended and never auto-advances away.
// Freeform workouts never auto-advance. The target is searched forward from
// the finished exercise and wraps around, so an exercise done out of order
// is skipped rather than revisited.
function hasUnloggedPlannedSets(id: string): boolean {
  if (!isTemplateExercise(id)) return false
  const target = configuredTargetFor(id)
  return target === null ? loggedCountFor(id) === 0 : loggedCountFor(id) < target
}

function nextUnfinishedExerciseAfter(id: string): string | null {
  const ids = workoutExerciseIds.value
  const start = ids.indexOf(id)
  for (let step = 1; step < ids.length; step++) {
    const candidate = ids[(start + step) % ids.length]
    if (hasUnloggedPlannedSets(candidate)) return candidate
  }
  return null
}

// Rule 5: every exercise in the template has completed its plan. Legacy
// rows without a target require at least one logged set. Drives item 109's
// auto-finish below, and otherwise (auto-finish suppressed) a note by the
// pinned Finish button.
const allPlannedSetsDone = computed(() => {
  if (!workout.activeTemplateId) return false
  const ids = workoutExerciseIds.value.filter(isTemplateExercise)
  return ids.length > 0 && ids.every((id) => !hasUnloggedPlannedSets(id))
})

// The exercise whose planned sets just finished, and where it'll advance to.
const upNextToast = ref<string | null>(null)
let advanceTimeout: ReturnType<typeof setTimeout> | undefined

const restUpNextName = computed(() =>
  pendingAdvance.value && activeRest.value ? exerciseName(pendingAdvance.value.toId) : null,
)
// The lock-screen timer (#143) names it too.
watch(restUpNextName, (name) => (rest.upNextName = name), { immediate: true })

function clearPendingAdvance() {
  clearTimeout(advanceTimeout)
  pendingAdvance.value = null
  upNextToast.value = null
}

function scheduleAdvanceAfterPlannedSets(id: string) {
  clearPendingAdvance()
  if (hasUnloggedPlannedSets(id) || configuredTargetFor(id) === null) return
  const toId = nextUnfinishedExerciseAfter(id)
  if (!toId) return
  pendingAdvance.value = { fromId: id, toId }
  // With a rest running, finishRest/skipRest above take it from here.
  if (activeRest.value) return
  upNextToast.value = exerciseName(toId)
  advanceTimeout = setTimeout(runPendingAdvance, 1500)
}

// Rule 4: never advance while an extra set is in progress on the finished
// exercise -- a row the user added after the planned ones, or focus sitting
// in one of the workout's fields -- or once the user already moved on.
function extraSetInProgress(id: string): boolean {
  if ((draftRowsByExercise.value[id] ?? []).length > 0) return true
  if (editingSetId.value) return true
  const focused = document.activeElement
  return !!focused && focused.matches('input, textarea, select')
}

function runPendingAdvance() {
  const pending = pendingAdvance.value
  clearPendingAdvance()
  if (!pending || !workout.activeWorkoutId) return
  if (exerciseId.value !== pending.fromId || extraSetInProgress(pending.fromId)) return
  // Re-resolve in case something else got finished meanwhile.
  const toId = hasUnloggedPlannedSets(pending.toId) ? pending.toId : nextUnfinishedExerciseAfter(pending.fromId)
  if (toId) selectExercise(toId)
}

// Backlog item 109 (supersedes item 104's rule 5): once the set that makes
// allPlannedSetsDone true is logged, skip its rest, show a ~1.5s "Finishing
// workout…" moment in the dock, then run the same path as tapping Finish.
// The recap's "Finished too early? Resume" link is the undo. Suppressed by
// the same in-progress rules as auto-advance (checked again when the moment
// ends), and held while a record celebration is up so it isn't yanked away.
const autoFinishing = ref(false)
let autoFinishTimeout: ReturnType<typeof setTimeout> | undefined
let autoFinishFromId: string | null = null
let autoFinishDue = false

function autoFinishApplies(id: string): boolean {
  return allPlannedSetsDone.value && !hasUnconfirmedSet.value && !extraSetInProgress(id)
}

function cancelAutoFinish() {
  clearTimeout(autoFinishTimeout)
  autoFinishing.value = false
  autoFinishFromId = null
  autoFinishDue = false
}

function scheduleAutoFinish(id: string) {
  cancelAutoFinish()
  clearPendingAdvance()
  rest.skip()
  autoFinishing.value = true
  autoFinishFromId = id
  autoFinishTimeout = setTimeout(runAutoFinish, 1500)
}

function runAutoFinish() {
  const id = autoFinishFromId
  if (!id || !workout.activeWorkoutId || !autoFinishApplies(id)) {
    cancelAutoFinish()
    return
  }
  if (recordCelebration.value) {
    autoFinishDue = true
    return
  }
  cancelAutoFinish()
  handleFinish()
}

watch(recordCelebration, (celebration) => {
  if (!celebration && autoFinishDue) runAutoFinish()
})

// RPE is optional, so its input has no `required` guard forcing reps/weight
// to a real value before submit — v-model.number leaves an emptied field as
// '' rather than coercing it to null, and that '' sent straight through to
// Postgres's numeric rpe column is what throws "invalid input syntax for
// type numeric".
function normalizeRpe(value: number | null): number | null {
  return (value as unknown) === '' ? null : value
}

// Issue #90: the exercise's own rest wins (0 is no timer); otherwise the
// Account default.
function startRestIfConfigured(id: string) {
  // Issue #150: a swapped-in exercise uses the replaced one's rest setting.
  const restId = swapRestSource.value[id] ?? id
  const own = exercises.exercises.find((e) => e.id === restId)?.rest_seconds ?? null
  const restSeconds = own ?? profile.defaultRestSeconds
  if (!restSeconds) return
  // Issue #429: the rest screen names where the time came from and links to it.
  rest.start(exerciseName(id), restSeconds, restHeadlineFor(id), {
    exerciseId: restId,
    exerciseName: exerciseName(restId),
    kind: own === null ? 'default' : 'exercise',
  })
}

// Issue #183: the bunny's rest line, about the set just logged: compared
// with the same set last time (the one the row pre-filled from), or the last
// planned set of the workout coming up.
function restHeadlineFor(id: string): string {
  const logged = workout.activeSets.filter((s) => s.exercise_id === id)
  const set = logged[logged.length - 1]
  const last = (previousSetsByExercise.value[id] ?? fallbackSetsByExercise[id])?.[logged.length - 1] ?? null
  return restLine(
    {
      exerciseName: exerciseName(id),
      loadType: loadTypeFor(id),
      set: set ?? { reps: null, weight: 0, weight_unit: 'lb', level: null, rpe: null },
      last,
      lastSetName: lastPlannedSetName(),
    },
    workout.activeWorkoutId,
  )
}

// The exercise holding the workout's one remaining planned set, if exactly
// one is left.
function lastPlannedSetName(): string | null {
  if (!workout.activeTemplateId) return null
  let left = 0
  let onId: string | null = null
  for (const te of activeTemplateExercises.value) {
    const target = te.target_sets
    const remaining = target === null ? (loggedCountFor(te.exercise_id) === 0 ? 1 : 0) : Math.max(target - loggedCountFor(te.exercise_id), 0)
    left += remaining
    if (remaining > 0) onId = te.exercise_id
  }
  return left === 1 && onId ? exerciseName(onId) : null
}

// Backlog item 1: completing one row saves just that set — the other rows
// stay put, editable, and independently completable (including while rest
// for this one is running). `row.saving` disables only this row's own
// button for the duration of its request, same reasoning item 11 originally
// used for the single "Add set" button: without it, two taps on the same
// row could race over the network and land in the opposite order from how
// they were tapped.
async function completeRow(id: string, row: DraftRow) {
  // Backlog item 100: prime the shared rest-chime AudioContext here, still
  // synchronously inside this click handler, so it counts as the "user
  // gesture" mobile browsers require -- priming later, once the rest period
  // actually completes, would be too late.
  primeRestChimeAudio()
  const type = loadTypeFor(id)
  const isLevel = type === 'level'
  const isTimed = type === 'timed'
  if (row.saving) return
  let durationSeconds: number | null = null
  if (isTimed) {
    durationSeconds = parseDurationLabel(row.durationInput)
    if (durationSeconds === null) return
  } else {
    if (row.reps === null) return
    if (isLevel && row.level === null) return
    // Backlog item 78: only a plain 'weight' exercise requires a weight
    // value — bodyweight's "Added weight" defaults to 0 when left blank.
    if (type === 'weight' && row.weight === null) return
  }
  if (!passesSetCheck(id, row, rowWeightUnit.value, 'log')) return
  const exercise = exercises.exercises.find((e) => e.id === id)
  workout.noteSetTarget(row.key, winTargetFor(id, row))
  row.saving = true
  row.error = ''
  const retry = row.attempted
  row.attempted = true
  const { error, reconciled } = await workout.addSet(
    id,
    isTimed ? null : row.reps,
    isLevel || isTimed ? 0 : (row.weight ?? 0),
    rowWeightUnit.value,
    normalizeRpe(row.rpe),
    isLevel ? row.level : isTimed && exercise?.tracks_level ? row.level : null,
    durationSeconds,
    isTimed && exercise?.tracks_distance ? row.distance : null,
    isTimed && exercise?.tracks_distance ? rowDistanceUnit.value : null,
    isTimed && exercise?.tracks_incline ? row.incline : null,
    isTimed && exercise?.tracks_calories ? row.calories : null,
    row.key,
    retry
  )
  row.saving = false
  if (error) {
    row.error = 'Set not confirmed. Check your connection, then retry. Your entries are still here.'
    return
  }

  const rows = draftRowsByExercise.value[id] ?? []
  const index = rows.indexOf(row)
  if (index !== -1) rows.splice(index, 1)

  // No configured count means an open-ended exercise — keep exactly one
  // open row available so logging stays a quick, repeated tap instead of
  // requiring "+ Add row" after every single set. A configured target_sets
  // stays fixed at that count instead; over/under-running it is what the
  // manual add/remove controls are for. Only replenishes when that was the
  // last open row: a manual "+ Add row" (or several) still leaves the
  // others open, and topping every completion back up regardless of what's
  // already sitting there would let a handful of manual adds compound into
  // a permanently oversized grid that never settles back to one blank row.
  if (configuredTargetFor(id) === null && rows.length === 0) {
    const nextRow = makeDraftRow()
    applyPrefillToRow(nextRow, id, loggedCountFor(id) + rows.length)
    rows.push(nextRow)
  }

  // A reconciled set was saved earlier, so a new full rest period would be
  // misleading. The saved row is visible and can be corrected with Edit.
  if (autoFinishApplies(id)) {
    scheduleAutoFinish(id)
    return
  }
  if (!reconciled) {
    const restBefore = activeRest.value?.id
    startRestIfConfigured(id)
    // Only a rest this set started shows its wins (issue #479).
    if (activeRest.value && activeRest.value.id !== restBefore) {
      restWinsFor.value = { restId: activeRest.value.id, setId: row.key }
    }
  }
  scheduleAdvanceAfterPlannedSets(id)
}

// Issue #475: the target a row showed when it was logged, for the small wins
// check: Premium's per-set target, or else the free Next time target
// (lib/repRecords.ts) for a weight exercise. None with targets turned off.
function winTargetFor(id: string, row: DraftRow): WinTarget | null {
  const shown = targetByRowKey.value[row.key]
  if (shown) return { kind: shown.kind, unit: shown.unit, weight: shown.weight, reps: shown.reps }
  if (hasPremium('targets') || loadTypeFor(id) !== 'weight') return null
  const ex = exercises.exercises.find((e) => e.id === id)
  const history = workout.targetHistoryByExercise[id]
  if (!ex || !history) return null
  const next = buildRepRecords(history, rowWeightUnit.value, progressionFor(profile.plates, usesBarbell(ex)))
  return next?.next ? { kind: 'weight', unit: next.unit, weight: next.next.weight, reps: next.next.reps } : null
}

// Issue #475: the rest screen lists the small wins of the set that started
// it; they can land a moment after the rest does.
const restWinsFor = ref<{ restId: number; setId: string } | null>(null)
const restWins = computed(() => {
  const current = restWinsFor.value
  if (!current || activeRest.value?.id !== current.restId) return []
  return visibleWins(workout.smallWinsBySetId[current.setId] ?? [], hasPremium('progress'))
})

function setWinChip(setId: string) {
  return topWin(workout.smallWinsBySetId[setId] ?? [], hasPremium('progress'))
}

// Backlog item 13: inline edit for a set still in the active workout — one
// row's id tracked here, null means no row is being edited. Item 103 moved
// the editor into the set card: the logged row's pencil turns it back into
// the same inputs a draft row has, so the in-progress values live in a
// DraftRow-shaped editRow the draft template branches can bind to as-is.
// Units stay per set (not the card's shared rowWeightUnit/rowDistanceUnit),
// so editing an old kg set doesn't silently flip it to lb.
const editingSetId = ref<string | null>(null)
const editRow = ref<DraftRow>(makeDraftRow())
const editWeightUnit = ref<WeightUnit>(profile.defaultWeightUnit)
const editDistanceUnit = ref<DistanceUnit>('mi')

// Issue #57: switching units converts the weights typed or pre-filled in
// the current exercise's unsaved rows (logged sets keep their own stored
// unit). Tapping the already-selected unit is a no-op, so repeated taps
// can't compound the 0.5 rounding.
function setRowWeightUnit(unit: WeightUnit) {
  const from = rowWeightUnit.value
  if (from === unit) return
  for (const row of draftRows.value) {
    if (row.saving) continue
    row.weight = convertSetWeight(row.weight, from, unit)
    clearRowCheck(row)
  }
  rowWeightUnit.value = unit
}

function setEditWeightUnit(unit: WeightUnit) {
  const from = editWeightUnit.value
  if (from === unit) return
  editRow.value.weight = convertSetWeight(editRow.value.weight, from, unit)
  clearRowCheck(editRow.value)
  editWeightUnit.value = unit
}

function startEditingSet(set: SetEntry) {
  confirmingDeleteSetId.value = null
  editingSetId.value = set.id
  editRow.value = {
    ...makeDraftRow(),
    reps: set.reps,
    weight: set.weight,
    level: set.level,
    rpe: set.rpe,
    durationInput: set.duration_seconds !== null ? formatSecondsAsClock(set.duration_seconds) : '',
    distance: set.distance,
    incline: set.incline,
    calories: set.calories,
  }
  editWeightUnit.value = set.weight_unit
  editDistanceUnit.value = set.distance_unit ?? 'mi'
}

function cancelEditingSet() {
  editingSetId.value = null
  confirmingDeleteSetId.value = null
}

async function saveSetEdit(id: string, exerciseId: string) {
  const row = editRow.value
  if (row.saving) return
  const type = loadTypeFor(exerciseId)
  const isLevel = type === 'level'
  const isTimed = type === 'timed'
  const exercise = exercises.exercises.find((e) => e.id === exerciseId)

  let durationSeconds: number | null = null
  if (isTimed) {
    durationSeconds = parseDurationLabel(row.durationInput)
    if (durationSeconds === null) return
  } else {
    if (row.reps === null) return
    if (isLevel && row.level === null) return
    if (type === 'weight' && row.weight === null) return
  }
  if (!passesSetCheck(exerciseId, row, editWeightUnit.value, 'save')) return

  row.saving = true
  row.error = ''
  const { error } = isTimed
    ? await workout.updateSet(
        id,
        null,
        0,
        editWeightUnit.value,
        normalizeRpe(row.rpe),
        exercise?.tracks_level ? row.level : null,
        durationSeconds,
        exercise?.tracks_distance ? row.distance : null,
        exercise?.tracks_distance ? editDistanceUnit.value : null,
        exercise?.tracks_incline ? row.incline : null,
        exercise?.tracks_calories ? row.calories : null,
      )
    : await workout.updateSet(
        id,
        row.reps,
        isLevel ? 0 : (row.weight ?? 0),
        editWeightUnit.value,
        normalizeRpe(row.rpe),
        isLevel ? row.level : null,
      )
  row.saving = false
  if (error) {
    row.error = isCheckConstraintError(error) ? SET_EDIT_FAILED_MESSAGE : error.message
  } else if (editingSetId.value === id) {
    cancelEditingSet()
  }
}

// Issue #336: runs the set checks before a save. Returns false (and leaves
// the message on the row) when the save has to wait: blocked, or waiting on
// "Log anyway". Compared against the heaviest set of this exercise's
// previous session, the same sets the row pre-fills from.
function passesSetCheck(id: string, row: DraftRow, unit: WeightUnit, action: 'log' | 'save'): boolean {
  const check = checkSetEntry({
    loadType: loadTypeFor(id),
    exerciseName: exerciseName(id),
    reps: row.reps,
    weight: row.weight,
    weightUnit: unit,
    level: row.level,
    previousHeaviest: heaviestWeight(previousSetsByExercise.value[id] ?? fallbackSetsByExercise[id], unit),
    action,
  })
  row.notice = check.block ?? ''
  row.confirm = check.block || row.confirmed ? '' : (check.confirm ?? '')
  return !row.notice && !row.confirm
}

function clearRowCheck(row: DraftRow) {
  row.notice = ''
  row.confirm = ''
  row.confirmed = false
}

function fixRowCheck(row: DraftRow) {
  row.confirm = ''
  const input = document.getElementById(`row-weight-${row.key}`) as HTMLInputElement | null
  input?.focus()
}

function confirmRowCheck(entry: Exclude<CombinedRow, { type: 'logged' }>) {
  entry.row.confirm = ''
  entry.row.confirmed = true
  submitRow(entry)
}

// Backlog item 51: same inline confirm pattern as WorkoutHistory.vue's
// whole-workout delete — a logged set has no undo, so deleting it shouldn't
// be a single accidental tap.
const confirmingDeleteSetId = ref<string | null>(null)

async function handleDeleteSet(id: string) {
  errorMessage.value = ''
  if (editingSetId.value === id) editingSetId.value = null
  confirmingDeleteSetId.value = null
  const { error } = await workout.deleteSet(id)
  if (error) errorMessage.value = error.message
}

function exerciseName(id: string): string {
  return exercises.exercises.find((e) => e.id === id)?.name ?? 'Unknown'
}

// Backlog item 76: a level exercise's set form/rendering swaps weight+unit
// for a whole-number level field — this is looked up by exercise id rather
// than carried on the set itself since draft rows aren't saved yet.
function loadTypeFor(id: string) {
  return exercises.exercises.find((e) => e.id === id)?.load_type ?? 'weight'
}

const selectedExerciseLoadType = computed(() => (exerciseId.value ? loadTypeFor(exerciseId.value) : 'weight'))
const isSelectedExerciseLevel = computed(() => selectedExerciseLoadType.value === 'level')
// Backlog item 78: a bodyweight exercise's "Weight" field becomes an
// optional "Added weight" (vest/dip belt) — reps is the only required
// number, unlike a plain 'weight' exercise where weight is required too.
const isSelectedExerciseBodyweight = computed(() => selectedExerciseLoadType.value === 'bodyweight')
// Backlog item 79: an assisted exercise's "Weight" field becomes "Assist"
// (the counterweight amount) — also optional, same as bodyweight's added
// weight, since 0 assist is a valid value (fully unassisted).
const isSelectedExerciseAssisted = computed(() => selectedExerciseLoadType.value === 'assisted')
const isSelectedExerciseWeightRequired = computed(() => selectedExerciseLoadType.value === 'weight')
// Backlog item 93: a timed exercise's set form swaps reps/weight for a
// duration field, plus whichever of distance/incline/level it tracks.
const isSelectedExerciseTimed = computed(() => selectedExerciseLoadType.value === 'timed')
const selectedExercise = computed(() => (exerciseId.value ? exercises.exercises.find((e) => e.id === exerciseId.value) ?? null : null))
const selectedExerciseTracksDistance = computed(() => selectedExercise.value?.tracks_distance ?? false)
const selectedExerciseTracksIncline = computed(() => selectedExercise.value?.tracks_incline ?? false)
const selectedExerciseTracksLevel = computed(() => selectedExercise.value?.tracks_level ?? false)
const selectedExerciseTracksCalories = computed(() => selectedExercise.value?.tracks_calories ?? false)

// Issue #22: the Plates button on the unit row opens PlateCalculatorSheet
// for the row being edited, or else the first open draft row, and "Use"
// writes the weight back into that row.
const showPlatesButton = computed(() => !!selectedExercise.value && usesBarbell(selectedExercise.value))
const plateSheetOpen = ref(false)
// Issue #142: opened from a warm-up line, the sheet shows that weight and
// "Use" just closes it (warm-ups aren't logged).
const plateWarmupWeight = ref<number | null>(null)
watch(plateSheetOpen, (open) => {
  if (!open) plateWarmupWeight.value = null
})
const plateTarget = computed<{ row: DraftRow; unit: WeightUnit } | null>(() => {
  if (editingSetId.value) return { row: editRow.value, unit: editWeightUnit.value }
  const row = draftRows.value[0]
  return row ? { row, unit: rowWeightUnit.value } : null
})

// Issue #104: Home's "+ New routine" opens the Premium sheet in place of
// Templates once the free limit is reached.
async function openNewTemplate() {
  if (await templates.canCreateTemplate()) router.push({ name: 'templates' })
  else openPremiumSheet('templates')
}

// Issue #104: the calculator is Premium; without it the button stays and
// opens the Premium sheet. Nothing about logging the set changes.
function openPlateSheet() {
  if (!hasPremium('plates')) {
    openPremiumSheet('plates')
    return
  }
  if (!profile.fetched) profile.fetchProfile()
  if (!plateTarget.value && exerciseId.value) addDraftRow(exerciseId.value)
  plateSheetOpen.value = true
}

function usePlateWeight(weight: number) {
  if (plateWarmupWeight.value === null && plateTarget.value) plateTarget.value.row.weight = weight
  plateSheetOpen.value = false
}

// Issue #140: Premium's next-set target. It reads history from before this
// workout, in the rows' unit, and only fills a row when tapped: rows still
// pre-fill from last time (#60), and logged sets are never touched. Issue
// #160: each open row gets its own target chip (buildSetTargets), and the
// card above the rows is left for #141's stall note and lighter-week offer,
// shown only before the exercise's first set today.
const targetWhyRowKey = ref<string | null>(null)
watch(exerciseId, () => {
  targetWhyRowKey.value = null
})

function targetKindFor(id: string): 'weight' | 'level' | null {
  const type = loadTypeFor(id)
  return type === 'weight' || type === 'level' ? type : null
}

watch(
  [exerciseId, () => hasPremium('targets'), () => workout.activeWorkoutId],
  ([id, premium, workoutId]) => {
    // Issue #475: free weight exercises read it too, for the Target hit win.
    if (id && workoutId && (premium ? targetKindFor(id) : loadTypeFor(id) === 'weight')) workout.fetchTargetHistory(id)
  },
  { immediate: true },
)

const selectedTarget = computed(() => {
  const id = exerciseId.value
  const ex = selectedExercise.value
  if (!id || !ex || !hasPremium('targets') || targetsOffIds.value.includes(id)) return null
  const kind = targetKindFor(id)
  const history = workout.targetHistoryByExercise[id]
  if (!kind || !history) return null
  // Issue #141: stalls and lighter weeks, from the same history.
  return buildSmartTarget(history, kind, rowWeightUnit.value, progressionFor(profile.plates, usesBarbell(ex)), {
    flatSince: flatSince(ex.load_type, ex.tracks_distance, history, rowWeightUnit.value),
    decision: lighterWeekDecisions.value[id] ?? null,
  })
})

function chooseLighterWeek(accepted: boolean) {
  const target = selectedTarget.value
  if (target && exerciseId.value) decideLighterWeek(exerciseId.value, target, accepted)
  if (accepted) void nextTick(() => fillOpenRows(draftRows.value, targetByRowKey.value, fillSetTarget))
}

const targetByRowKey = computed<Record<string, SetTarget>>(() => {
  const base = selectedTarget.value
  const id = exerciseId.value
  const ex = selectedExercise.value
  const history = id ? workout.targetHistoryByExercise[id] : undefined
  if (!base || !id || !ex || !history) return {}
  const rows = draftRows.value
  const targets = buildSetTargets(base, history, loggedCountFor(id), rows.length, progressionFor(profile.plates, usesBarbell(ex)))
  return Object.fromEntries(rows.map((row, i) => [row.key, targets[i]]))
})

function fillSetTarget(row: DraftRow, target: SetTarget) {
  if (target.kind === 'level') row.level = target.weight
  else row.weight = target.weight
  row.reps = target.reps
  clearRowCheck(row)
}

// Issue #142: barbell or dumbbell, for the warm-up guide and the related-lift
// match; null for anything else (machines, cables, custom exercises whose
// equipment isn't known).
function equipmentOf(ex: Exercise): string | null {
  if (ex.load_type !== 'weight') return null
  if (usesBarbell(ex)) return 'barbell'
  const id = ex.library_id ?? findLibraryMatch(ex.name)?.id ?? null
  return (id ? libraryEntry(id)?.equipmentType : null) ?? null
}

function warmupEquipmentOf(ex: Exercise): WarmupEquipment | null {
  const equipment = equipmentOf(ex)
  return equipment === 'barbell' || equipment === 'dumbbell' ? equipment : null
}

function loadFor(ex: Exercise, unit: WeightUnit): WarmupLoad {
  return usesBarbell(ex) ? { bar: barWeight(ex, unit), plates: profile.plates[unit] } : {}
}

// Issue #142: a starting weight the first time a weight lift is logged:
// Premium, Targets on, no past sets for it and none yet today. Part 1's
// targets take over after the first set.
const isBrandNewLift = computed(() => {
  const id = exerciseId.value
  const ex = selectedExercise.value
  if (!id || !ex || ex.load_type !== 'weight' || !hasPremium('targets') || targetsOffIds.value.includes(id)) return false
  const history = workout.targetHistoryByExercise[id]
  if (!history || loggedCountFor(id) > 0) return false
  return !history.some((w) => w.sets.some((s) => s.reps !== null && s.reps > 0 && s.weight > 0))
})

watch(isBrandNewLift, (fresh) => {
  if (fresh && !workout.progressSetsFetched) workout.fetchProgressSets()
}, { immediate: true })

const startingLift = computed(() => {
  const ex = selectedExercise.value
  if (!ex) return null
  return liftForExercise(ex, (name) => findLibraryMatch(name)?.id ?? null)
})

// Same muscle group and equipment, logged before, with an est. 1RM.
const relatedLifts = computed<RelatedLift[]>(() => {
  const ex = selectedExercise.value
  if (!ex || !isBrandNewLift.value || !workout.progressSetsFetched) return []
  const equipment = equipmentOf(ex)
  if (!ex.muscle_group || !equipment) return []
  const unit = rowWeightUnit.value
  const byExercise = new Map<string, typeof workout.progressSets>()
  for (const row of workout.progressSets) {
    if (row.exercise_id === ex.id) continue
    const list = byExercise.get(row.exercise_id)
    if (list) list.push(row)
    else byExercise.set(row.exercise_id, [row])
  }
  const lifts: RelatedLift[] = []
  for (const [id, rows] of byExercise) {
    const other = exercises.exercises.find((e) => e.id === id)
    if (!other || other.load_type !== 'weight' || other.muscle_group !== ex.muscle_group || equipmentOf(other) !== equipment) continue
    const oneRepMax = bestEstimate(rows, unit)
    if (oneRepMax !== null) lifts.push({ name: other.name, oneRepMax })
  }
  return lifts
})

// Step 2.2 needs the sex answer from #136. Asked here once, on the first
// brand-new lift that could use it; the question stays up for that lift.
const startSexAskedFor = ref<string | null>(null)
const askStartSex = computed(() => {
  const ex = selectedExercise.value
  if (!ex || !isBrandNewLift.value || !workout.progressSetsFetched || relatedLifts.value.length > 0) return false
  if (!startingLift.value || startingLift.value.equipment === 'bodyweight' || !bodyWeight.latestEntry) return false
  if (strengthSex.value !== null) return false
  return !startSexAsked.value || startSexAskedFor.value === ex.id
})

watch(askStartSex, (asking) => {
  if (asking && exerciseId.value && startSexAskedFor.value !== exerciseId.value) {
    startSexAskedFor.value = exerciseId.value
    markStartSexAsked()
  }
}, { immediate: true })

const startingWeight = computed<StartingWeight | null>(() => {
  const ex = selectedExercise.value
  if (!ex || !isBrandNewLift.value || !workout.progressSetsFetched) return null
  const lift = startingLift.value
  const entry = bodyWeight.latestEntry
  const unit = rowWeightUnit.value
  return pickStartingWeight({
    related: relatedLifts.value,
    lift,
    sex: strengthSex.value,
    bodyWeight: entry ? { weight: entry.weight, unit: entry.weight_unit } : null,
    unit,
    equipment: warmupEquipmentOf(ex),
    load: loadFor(ex, unit),
    oneSided: !!lift && convertsOneSided(ex, lift),
  })
})

function fillStartingWeight() {
  const start = startingWeight.value
  if (!start || start.weight === null || !exerciseId.value) return
  if (!draftRows.value[0]) addDraftRow(exerciseId.value)
  const row = draftRows.value[0]
  if (!row) return
  row.weight = start.weight
  row.reps = start.reps
}

// Issue #142: the warm-up guide, up to the first open set's target (or the
// starting weight), before the exercise's first set today. Collapsed until
// tapped; a barbell line opens the plate calculator at that weight.
const warmupOpen = ref(false)
watch(exerciseId, () => {
  warmupOpen.value = false
})

const warmupSets = computed<WarmupSet[]>(() => {
  const id = exerciseId.value
  const ex = selectedExercise.value
  if (!id || !ex || loggedCountFor(id) > 0) return []
  const equipment = warmupEquipmentOf(ex)
  if (!equipment) return []
  const first = draftRows.value[0]
  const rowTarget = first ? targetByRowKey.value[first.key] : undefined
  const target = selectedTarget.value
  const working =
    rowTarget && rowTarget.kind === 'weight'
      ? rowTarget.weight
      : target && target.kind === 'weight'
        ? target.weight
        : startingWeight.value?.weight ?? null
  if (!working) return []
  return buildWarmup(working, equipment, rowWeightUnit.value, loadFor(ex, rowWeightUnit.value))
})

const warmupTop = computed(() => {
  const sets = warmupSets.value
  return sets.length ? sets[sets.length - 1].weight : null
})

function openWarmupPlates(weight: number) {
  if (!hasPremium('plates')) {
    openPremiumSheet('plates')
    return
  }
  if (!profile.fetched) profile.fetchProfile()
  plateWarmupWeight.value = weight
  plateSheetOpen.value = true
}

// Backlog item 97: Treadmill (distance + incline) wraps its entry row to a
// second line for Incline, but a shared header row assumes every row stays
// on one line -- once a row wraps, the header no longer lines up with the
// field it names. 0 or 1 tracked extra keeps the compact single-line grid
// with its shared header; 2 or more drops the header entirely in favor of a
// small label on every field (see the labeled-field template branch below).
const selectedExerciseTimedExtrasCount = computed(
  () =>
    [
      selectedExerciseTracksDistance.value,
      selectedExerciseTracksIncline.value,
      selectedExerciseTracksLevel.value,
      selectedExerciseTracksCalories.value,
    ].filter(Boolean).length,
)
const useLabeledTimedFields = computed(() => selectedExerciseTimedExtrasCount.value >= 1)

function toggleRowDistanceUnit() {
  rowDistanceUnit.value = rowDistanceUnit.value === 'mi' ? 'km' : 'mi'
}
function distanceUnitChipLabel(unit: DistanceUnit): string {
  return unit === 'mi' ? 'Switch to kilometers' : 'Switch to miles'
}

function handleDurationInput(target: HTMLInputElement, apply: (value: string) => void) {
  apply(formatDurationDigits(target.value))
}

// Issue #85: a stopwatch for an unlogged timed row. The row's Time at Start
// is the goal; Stop writes the elapsed time back into the row without
// logging it, so a mistimed stop can be fixed before "Add set".
// Issue #191: it also shows which set this is (the logger's numbering, "of M"
// only when the routine plans a count) and the same set last time, read the
// way the row's prefill does.
const stopwatch = ref<{
  row: DraftRow
  exerciseName: string
  startedAt: number
  goalSeconds: number | null
  setLabel: string | null
  lastTimeLabel: string | null
} | null>(null)

function startStopwatch(id: string, row: DraftRow) {
  // Still inside the tap, so the goal chime is allowed to play later.
  primeRestChimeAudio()
  if (activeRest.value) skipRest()
  const entries = id === exerciseId.value ? combinedRows.value : []
  const number = entries.find((entry) => entry.type === 'draft' && entry.row === row)?.number ?? null
  const setLabel =
    number === null ? null : configuredTargetFor(id) !== null ? `Set ${number} of ${entries.length}` : `Set ${number}`
  const last = number === null ? null : (previousSetsByExercise.value[id] ?? fallbackSetsByExercise[id])?.[number - 1]
  const lastTimeLabel =
    last && last.duration_seconds !== null
      ? formatSetLabel('timed', last.reps, last.weight, last.weight_unit, last.level, {
          durationSeconds: last.duration_seconds,
          distance: last.distance,
          distanceUnit: last.distance_unit,
          incline: null,
          calories: null,
        })
      : null
  stopwatch.value = {
    row,
    exerciseName: exerciseName(id),
    startedAt: Date.now(),
    goalSeconds: parseDurationLabel(row.durationInput),
    setLabel,
    lastTimeLabel,
  }
}

function stopStopwatch(elapsedSeconds: number) {
  if (stopwatch.value) stopwatch.value.row.durationInput = formatSecondsAsClock(elapsedSeconds)
  stopwatch.value = null
}
const selectedExerciseWeightFieldLabel = computed(() => {
  if (isSelectedExerciseBodyweight.value) return 'Added weight'
  if (isSelectedExerciseAssisted.value) return 'Assist'
  return 'Weight'
})

// Backlog item 8: surface setup notes (machine seat height, etc.) right
// where a set gets logged, not just in the Exercises tab.
const selectedExerciseNotes = computed(() => {
  if (!exerciseId.value) return null
  return exercises.exercises.find((e) => e.id === exerciseId.value)?.setup_notes ?? null
})

// Issue #535: this lift's note from its last session, and its note for this
// workout. Kept apart from setup notes (the pencil by the name), which are
// for the machine and stay on the exercise.
const lastExerciseNote = computed(() => (exerciseId.value ? (workout.lastExerciseNotes[exerciseId.value] ?? null) : null))
const todayExerciseNote = computed(() => (exerciseId.value ? (workout.activeExerciseNotes[exerciseId.value] ?? null) : null))
const editingTodayNote = ref(false)
const todayNoteDraft = ref('')
const todayNoteSaving = ref(false)
const todayNoteError = ref('')
const todayNoteInput = ref<HTMLTextAreaElement | null>(null)

watch(
  [exerciseId, () => workout.activeWorkoutId],
  ([id, workoutId]) => {
    editingTodayNote.value = false
    todayNoteError.value = ''
    if (id && workoutId) void workout.fetchLastExerciseNote(id)
  },
  { immediate: true },
)

function startTodayNote() {
  todayNoteDraft.value = todayExerciseNote.value ?? ''
  todayNoteError.value = ''
  editingTodayNote.value = true
  void nextTick(() => todayNoteInput.value?.focus())
}

async function saveTodayNote() {
  if (!exerciseId.value || todayNoteSaving.value) return
  todayNoteSaving.value = true
  const { error } = await workout.saveExerciseNote(exerciseId.value, todayNoteDraft.value)
  todayNoteSaving.value = false
  if (error) {
    todayNoteError.value = "Couldn't save the note. Try again."
    return
  }
  editingTodayNote.value = false
}

// Backlog item 1: id of the exercise whose history overlay is open, opened
// from right where a set gets logged (same idea as selectedExerciseNotes
// above) rather than requiring a trip to the Exercises tab mid-workout.
const viewingHistoryFor = ref<string | null>(null)

// Issue #81: id of the exercise whose setup-notes sheet is open, opened from
// the card's pencil button ("Add machine setup note"/"Edit machine setup note",
// #535) or by tapping the note
// itself. The pencil sits in the title row rather than as a text link beside
// "History": the footer is one fixed-height line that's already full on a
// 360-390px phone once a template's "3 of 4 sets logged" is showing.
const editingNotesFor = ref<string | null>(null)

// Issue #150: the card's swap button opens "Try instead" (ExerciseSwapSheet).
// Hidden once an exercise's planned sets are all logged, since there's
// nothing left to move to another exercise.
const swappingFor = ref<string | null>(null)
const swapBusy = ref(false)
const swapError = ref('')

function canSwap(id: string): boolean {
  const target = configuredTargetFor(id)
  return target === null || loggedCountFor(id) < target
}

function openSwap(id: string) {
  swapError.value = ''
  swappingFor.value = id
}

async function handleSwapPick(option: SwapOption) {
  const fromId = swappingFor.value
  if (!fromId || swapBusy.value) return
  swapError.value = ''
  let toId = option.exerciseId
  if (!toId && option.entry) {
    swapBusy.value = true
    const { data, error } = await exercises.addFromLibrary(option.entry)
    swapBusy.value = false
    if (error || !data) {
      swapError.value = error?.message ?? 'Could not add that exercise.'
      return
    }
    toId = data.id
  }
  if (!toId) return
  swapExerciseInWorkout(fromId, toId)
  swappingFor.value = null
}

// A template exercise hands its place in the deck and its remaining planned
// sets to the new one (workout.swappedExercises, keyed by the template's own
// exercise id, so swapping a swap just repoints it). An ad-hoc one is replaced
// in place. Sets already logged stay on the old exercise, which then stays in
// the deck as an open-ended extra.
function swapExerciseInWorkout(fromId: string, toId: string) {
  clearPendingAdvance()
  if (isTemplateExercise(fromId)) {
    const target = configuredTargetFor(fromId)
    const remaining = target === null ? null : Math.max(target - loggedCountFor(fromId), 0)
    const swaps = { ...swappedExercises.value }
    const origin = Object.keys(swaps).find((key) => swaps[key].to === fromId) ?? fromId
    if (toId === origin) delete swaps[origin]
    else {
      swaps[origin] = { to: toId, targetSets: remaining }
      workout.swapOrigins = { ...workout.swapOrigins, [toId]: origin }
    }
    swappedExercises.value = swaps
  } else if (adHocExerciseIds.value.includes(fromId)) {
    adHocExerciseIds.value = adHocExerciseIds.value.map((id) => (id === fromId ? toId : id))
  } else {
    adHocExerciseIds.value.push(toId)
  }
  // Rests like the exercise it replaced (or that one's own source, when
  // swapping a swap). Swapping back to the source just drops the entry.
  const restSource = swapRestSource.value[fromId] ?? fromId
  const rests = { ...swapRestSource.value }
  if (restSource === toId) delete rests[toId]
  else rests[toId] = restSource
  swapRestSource.value = rests
  // Both exercises' draft rows were built for the old plan.
  const drafts = { ...draftRowsByExercise.value }
  delete drafts[fromId]
  delete drafts[toId]
  draftRowsByExercise.value = drafts
  selectExercise(toId)
}

// Backlog item 106: post-finish session recap (replaced item 6's volume
// chart and item 105's timed summaries). Built from justFinishedWorkout
// once it's been re-fetched, freeform and templated alike; stays null when
// the finished workout had no sets (deleted by finishWorkout, item 9) or the
// recap's own queries failed, and the template then falls back to the plain
// "Resume your workout?" card.
const showingFinishSummary = computed(() => workout.finishRecap !== null)

// Issue #156: "swapped in for <original>" on the recap's rows.
const recapSwappedFor = computed(() => {
  const names: Record<string, string> = {}
  for (const [to, from] of Object.entries(workout.finishSwaps)) {
    const original = exercises.exercises.find((e) => e.id === from)
    if (original) names[to] = original.name
  }
  return names
})

// Backlog item 51: finishWorkout() silently deletes the workout row when no
// sets were logged (see finishWorkout in stores/workouts.ts) — confirm
// before that happens rather than letting a stray "Finish workout" tap
// discard the session with no feedback.
const confirmingEmptyFinish = ref(false)
const confirmingEarlyFinish = ref(false)
const unfinishedExercises = computed(() => workoutExerciseIds.value
  .filter((id) => hasUnloggedPlannedSets(id) || loggedCountFor(id) === 0)
  .map((id) => {
    const target = configuredTargetFor(id)
    return {
      id,
      name: exerciseName(id),
      progress: target === null ? '0 sets logged' : `${loggedCountFor(id)} of ${target} sets`,
    }
  }))
const hasUnconfirmedSet = computed(() => Object.values(draftRowsByExercise.value)
  .some((rows) => rows.some((row) => row.saving || !!row.error)))

// Larger-logging redesign: Finish workout is pinned just above the bottom
// nav whenever the active-workout screen is showing (the same conditions the
// template's v-if/v-else chain reaches it under), so it's never scrolled
// out of sight below the set card.
const showWorkoutDock = computed(
  () => !!workout.activeWorkoutId && !workout.recoverableWorkout && !showingFinishSummary.value && !workout.justFinishedWorkout,
)

// Item 111: tiles start a workout on tap, so a wrong tap needs a cheap way
// out. Until the first set is saved, "Change workout" drops the empty
// workout (finishWorkout deletes a set-less row, item 9) and goes straight
// back to the tiles, with no confirm since nothing is lost. Hidden once a set
// exists, when leaving means Finish or Discard like always.
const canChangeWorkout = computed(
  () => showWorkoutDock.value && workout.activeSets.length === 0 && !hasUnconfirmedSet.value,
)

function changeWorkout() {
  if (!canChangeWorkout.value) return
  handleFinish()
}

function handleFinishClick() {
  if (hasUnconfirmedSet.value) return
  if (workout.activeSets.length === 0 && !confirmingEmptyFinish.value) {
    confirmingEmptyFinish.value = true
    return
  }
  if (unfinishedExercises.value.length > 0) {
    clearPendingAdvance()
    confirmingEarlyFinish.value = true
    return
  }
  handleFinish()
}

async function handleFinish() {
  if (hasUnconfirmedSet.value) return
  confirmingEarlyFinish.value = false
  const hadSets = workout.activeSets.length > 0
  const finishedAt = new Date()
  clearPendingAdvance()
  cancelAutoFinish()

  // Issue #158: what was unusual, read before finishWorkout clears the plan.
  const events = workout.activeTemplateId
    ? buildWorkoutEvents({
        plan: activeTemplateExercises.value.map((te) => ({ exerciseId: te.exercise_id, targetSets: te.target_sets })),
        swaps: swappedExercises.value,
        loggedCount: loggedCountFor,
        nameOf: exerciseName,
      })
    : null

  await workout.finishWorkout(events, finishedAt)
  confirmingEmptyFinish.value = false
  templateId.value = null
  exerciseId.value = ''
  draftRowsByExercise.value = {}
  adHocExerciseIds.value = []
  swappedExercises.value = {}
  swapRestSource.value = {}
  recordCelebration.value = null

  // Resume-after-finish item: fetch the offer's data up front (rather than
  // lazily on tap) so the resume affordance can show immediately once it's
  // reached, whether that's the recap's "Finished too early? Resume" link or
  // (recap unavailable) its own "Resume your workout?" card. The recap has to
  // be fully built before it shows, not just before handleFinish returns --
  // otherwise a late arrival can switch the just-shown home screen mid-
  // interaction (surfaced as a flaky "element was detached from the DOM"
  // failure on the next click in template-or-freeform-choice.spec.ts).
  if (hadSets) {
    await workout.fetchJustFinishedWorkout()
    if (workout.justFinishedWorkout) await workout.fetchFinishRecap(workout.justFinishedWorkout, finishedAt)
  }
  workout.fetchProgressStats()
}

// Item 111: notes typed on the recap. Seeded from the workout's saved notes
// (a resumed-then-refinished workout may already have some) each time a
// recap appears, and written back only if they changed.
const recapNotes = ref('')
watch(
  () => workout.finishRecap,
  (recap) => {
    if (recap) recapNotes.value = workout.justFinishedWorkout?.notes ?? ''
  },
)

// Issue #187: the tiers this finish crossed that unlock an Extra get their
// own screen over the recap, once per finish. Extras are Premium (#190), and
// Milestone moments off (#186) hides it like the recap's card.
const unlockTiers = computed(() => {
  if (!workout.finishRecap || !milestoneMomentsOn.value || !isPremium.value) return []
  return (workout.finishMilestones?.tiers ?? []).filter((t) => rewardForTier(t.id))
})

async function saveRecapNotes() {
  const finished = workout.justFinishedWorkout
  if (!finished) return
  const next = recapNotes.value.trim() || null
  if (next === (finished.notes ?? null)) return
  const { error } = await workout.updateWorkoutNotes(finished.id, next)
  if (error) errorMessage.value = error.message
  else finished.notes = next
}

// Issue #149: "How did it feel?" tags save on each tap, not on Done, so a
// closed app keeps them.
const recapFeel = computed(() =>
  workout.justFinishedWorkout ? feelOf(workout.justFinishedWorkout) : null,
)

async function saveRecapFeel(patch: Partial<WorkoutFeel>) {
  const finished = workout.justFinishedWorkout
  if (!finished) return
  const { error } = await workout.updateWorkoutFeel(finished.id, patch)
  if (error) errorMessage.value = error.message
}

async function dismissFinishRecap() {
  await saveRecapNotes()
  // Marks crossed tiers seen even with Milestone moments off (#186), so
  // turning it back on doesn't replay them.
  workout.commitFinishMilestones()
  workout.clearFinishRecap()
  // Item 68: the resume-a-just-finished-workout offer moved onto this screen
  // (the "Finished too early? Resume" button above) — tapping through to a
  // new workout from here should go straight to the start screen, not
  // re-surface the same offer as a second gate.
  workout.dismissJustFinishedWorkout()
}

// Resume-after-finish item: mirrors handleResume above, but restores from
// justFinishedWorkout (the workout finishWorkout() just completed) instead
// of a crash-recovered one.
const justFinishedTemplateName = computed(
  () => workout.justFinishedWorkout?.workout_templates?.name ?? 'Freeform workout',
)

async function handleResumeJustFinished() {
  const justFinished = workout.justFinishedWorkout
  if (!justFinished) return
  if (workout.finishRecap) await saveRecapNotes()
  // Item 68: reachable from the recap's own "Finished too early? Resume"
  // link, so the recap itself (still showing at that point) has to be
  // cleared here too, not just by dismissFinishRecap.
  workout.clearFinishRecap()
  workout.resumeJustFinishedWorkout()
  templateId.value = justFinished.template_id ?? ''
  adHocExerciseIds.value = []
  swappedExercises.value = {}
  swapRestSource.value = {}
  exerciseId.value = ''
  if (justFinished.template_id) {
    await workout.fetchPreviousWorkout(justFinished.template_id, justFinished.id)
    if (!templates.exercisesByTemplate[justFinished.template_id]) {
      await templates.fetchTemplateExercises(justFinished.template_id)
    }
  }
  exerciseId.value = workoutExerciseIds.value[0] ?? ''
}
</script>

<template>
  <div :data-record-check="workout.recordChecksPending > 0 ? 'pending' : 'idle'">
    <!-- Larger-logging redesign: during a workout this one compact row holds
         the title, Add exercise, and Account. Account sits last (top right)
         to match its corner on every other screen (PageHeader.vue) -- item
         108. Outside a workout PageHeader is the title row (issue #65). -->
    <div v-if="workout.activeWorkoutId" class="log-header log-header-workout">
      <h2 class="workout-title">{{ headerTitle }}</h2>
      <span v-if="elapsedLabel" class="elapsed-time" aria-label="Time since workout started">{{ elapsedLabel }}</span>
      <!-- Issue #313 (design docs/design/issue-313-first-workout.html,
           option A): labeled, since a bare "+" didn't say what it adds. -->
      <button
        type="button"
        class="header-add-btn"
        aria-label="Add exercise"
        @click="openAddExercise"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>
        <span aria-hidden="true">Exercise</span>
      </button>
      <button type="button" class="header-icon-btn" aria-label="Account" @click="accountSheetOpen = true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </button>
    </div>
    <PageHeader v-else :title="headerTitle" />
    <WhatsNewBanner v-if="!workout.activeWorkoutId" />
    <TrialEndBanner v-if="!workout.activeWorkoutId" />
    <button v-if="canChangeWorkout" type="button" class="link-button change-workout" @click="changeWorkout">
      Wrong workout? Change it
    </button>

    <div v-if="workout.recoverableWorkout" class="card">
      <h3>Resume your workout?</h3>
      <p class="row-sub">
        {{ recoverableTemplateName }} · started {{ recoverableStartedLabel }}
        <template v-if="workout.recoverableWorkout.sets.length > 0">
          · {{ workout.recoverableWorkout.sets.length }} set{{ workout.recoverableWorkout.sets.length === 1 ? '' : 's' }} logged
        </template>
      </p>
      <div v-if="!confirmingDiscardRecovered" class="confirm-actions">
        <button type="button" class="btn-accent small" @click="handleResume">Resume workout</button>
        <button type="button" class="ghost small" @click="confirmingDiscardRecovered = true">Discard workout</button>
      </div>
      <div v-else class="confirm-delete">
        <span class="row-sub">
          Discard this workout{{ workout.recoverableWorkout.sets.length > 0 ? ' and its logged sets' : '' }}? This can't be undone.
        </span>
        <div class="confirm-actions">
          <button type="button" class="danger small" @click="handleDiscardRecovered">Discard workout</button>
          <button type="button" class="ghost small" @click="confirmingDiscardRecovered = false">Cancel</button>
        </div>
      </div>
    </div>

    <template v-else>
    <div v-if="workout.finishRecap" data-testid="post-finish-card">
      <FinishRecap
        :recap="workout.finishRecap"
        :milestones="milestoneMomentsOn ? workout.finishMilestones : null"
        :swapped-for="recapSwappedFor"
        v-model:notes="recapNotes"
        :feel="recapFeel"
        :can-resume="!!workout.justFinishedWorkout"
        @feel="saveRecapFeel"
        @done="dismissFinishRecap"
        @resume="handleResumeJustFinished"
        @open-history="viewingHistoryFor = $event"
      >
        <template #after-header>
          <section v-if="showSaveOffer" class="card save-offer" aria-labelledby="save-offer-title">
            <div class="save-offer-top">
              <div class="mascot mascot-sm">
                <img src="/icon-512.png" alt="" />
              </div>
              <div>
                <h4 id="save-offer-title" class="save-offer-title">Do this again?</h4>
                <p class="save-offer-copy">Save it as a routine and start it with one tap next time.</p>
              </div>
            </div>
            <form @submit.prevent="saveOfferAsTemplate">
              <label for="save-offer-name" class="save-offer-label">Routine name</label>
              <input id="save-offer-name" v-model="saveOfferName" type="text" required />
              <p v-if="saveOfferError" class="error">{{ saveOfferError }}</p>
              <div class="confirm-actions">
                <button type="submit" class="btn-accent save-offer-save" :disabled="saveOfferSaving || !saveOfferName.trim()">
                  Save as routine
                </button>
                <button type="button" class="ghost small" @click="hideSaveOfferOnce">Not now</button>
                <button type="button" class="ghost small" @click="dismissSaveOffer">Don't ask again</button>
              </div>
            </form>
          </section>
          <p v-else-if="saveOfferSavedName" class="save-offer-saved" role="status">
            Saved as {{ saveOfferSavedName }}. It's on Home for next time.
          </p>
          <section
            v-if="showRoutineUpdate"
            class="card save-offer routine-update"
            aria-labelledby="routine-update-title"
            data-testid="routine-update"
          >
            <div class="save-offer-top">
              <div class="mascot mascot-sm">
                <img src="/icon-512.png" alt="" />
              </div>
              <div>
                <h4 id="routine-update-title" class="save-offer-title routine-update-title">
                  Update {{ routineUpdateTemplate?.name }}?
                </h4>
                <p class="save-offer-copy">Keep today's changes for next time. Only the ticked ones are saved.</p>
              </div>
            </div>
            <div class="routine-update-list" role="group" aria-labelledby="routine-update-title">
              <label
                v-for="change in routineUpdateChanges"
                :key="change.key"
                class="routine-update-row"
                :class="{ on: routineUpdateChecked[change.key] }"
              >
                <input v-model="routineUpdateChecked[change.key]" type="checkbox" class="routine-update-input" />
                <span class="routine-update-check" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 13l4 4L19 7"></path>
                  </svg>
                </span>
                <span class="routine-update-text">
                  <template v-for="(part, index) in routineChangeParts(change, routineExerciseName)" :key="index">
                    <b v-if="part.strong">{{ part.text }}</b>
                    <span v-else :class="{ 'routine-update-dim': part.dim }">{{ part.text }}</span>
                  </template>
                </span>
              </label>
            </div>
            <p v-if="routineUpdateError" class="error">{{ routineUpdateError }}</p>
            <div class="confirm-actions">
              <button
                type="button"
                class="btn-accent save-offer-save"
                :disabled="routineUpdateSaving || routineUpdateCheckedCount === 0"
                @click="applyRoutineUpdate"
              >
                Update routine
              </button>
              <button type="button" class="ghost small" @click="dismissRoutineUpdate">Not now</button>
            </div>
          </section>
          <p v-else-if="routineUpdatedName" class="save-offer-saved" role="status">
            Updated {{ routineUpdatedName }}. Next time starts with today's changes.
          </p>
        </template>
      </FinishRecap>
    </div>

    <div v-else-if="workout.justFinishedWorkout" class="card">
      <h3>Resume your workout?</h3>
      <p class="row-sub">
        Just finished · {{ justFinishedTemplateName }}
        · {{ workout.justFinishedWorkout.sets.length }} set{{ workout.justFinishedWorkout.sets.length === 1 ? '' : 's' }} logged
      </p>
      <div class="confirm-actions">
        <button type="button" class="btn-accent small" @click="handleResumeJustFinished">Resume workout</button>
        <button type="button" class="ghost small" @click="workout.dismissJustFinishedWorkout()">Start a new workout</button>
      </div>
    </div>

    <template v-else-if="!workout.activeWorkoutId">
      <template v-if="!exercises.loading">
        <div v-if="exercises.activeExercises.length > 0" class="progress-strip">
          <div class="stat-tile stat-tile-week theme-corner theme-corner-feature">
            <span class="stat-eyebrow">This week</span>
            <div class="stat-value-row">
              <span class="stat-value">{{ workout.workoutsThisWeek }}</span>
              <span class="stat-value-unit">{{ workout.workoutsThisWeek === 1 ? 'workout' : 'workouts' }}</span>
            </div>
            <div class="paw-tracker">
              <span
                v-for="(done, day) in workout.workoutDaysThisWeek"
                :key="day"
                class="paw-day"
                :class="{ 'paw-day-done': done }"
                :aria-label="`${weekdayNames[day]}: ${done ? 'workout logged' : 'no workout logged'}`"
              >
                <DayMark v-if="done" />
              </span>
            </div>
          </div>
          <div v-if="workout.recentPr" class="stat-tile stat-tile-pr">
            <span class="pr-badge">NEW</span>
            <span class="stat-value">{{ workout.recentPr.loadType === 'level' ? 'Level PR!' : 'Volume PR!' }}</span>
            <span class="stat-label">{{ workout.recentPr.exerciseName }}</span>
            <span class="pr-detail">
              {{ formatSetLabel(workout.recentPr.loadType, workout.recentPr.reps, workout.recentPr.weight, workout.recentPr.weightUnit, workout.recentPr.level) }}
            </span>
          </div>
        </div>

        <!-- Issue #207 (design docs/design/issue-207-first-run.html, option B):
             three ways in for a brand-new account, none of them a detour
             through the Exercises tab. -->
        <div
          v-if="exercises.activeExercises.length === 0 && templates.activeTemplates.length === 0 && !setupStartPicked"
          class="card welcome-card"
        >
          <div class="welcome-head">
            <div class="mascot mascot-lg">
              <img src="/icon-512.png" alt="" />
            </div>
            <div>
              <p class="welcome-title">Welcome to RepBunny</p>
              <p id="welcome-copy" class="welcome-copy">How do you want to start?</p>
            </div>
          </div>
          <div class="welcome-choices" role="group" aria-labelledby="welcome-copy">
            <button
              type="button"
              class="welcome-choice welcome-choice-primary"
              aria-describedby="welcome-start-sub"
              :disabled="starting"
              @click="startFirstWorkout"
            >
              <span class="welcome-choice-icon" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M8 5v14l11-7z" /></svg>
              </span>
              <span class="welcome-choice-text">
                <span class="welcome-choice-name">Start a workout</span>
                <span id="welcome-start-sub" class="welcome-choice-sub">Pick exercises as you go</span>
              </span>
              <svg class="welcome-choice-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <button type="button" class="welcome-choice" aria-describedby="welcome-template-sub" @click="openWelcomeTemplate()">
              <span class="welcome-choice-icon welcome-choice-icon-template" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v3H8zM6 6h12v14H6z" /><path d="M9 12h6M9 16h4" /></svg>
              </span>
              <span class="welcome-choice-text">
                <span class="welcome-choice-name">Build a routine</span>
                <span id="welcome-template-sub" class="welcome-choice-sub">Plan a workout you'll repeat</span>
              </span>
              <svg class="welcome-choice-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <p class="welcome-label">Not sure what to train?</p>
            <button type="button" class="welcome-choice" aria-describedby="welcome-program-sub" @click="openStarterPrograms">
              <span class="welcome-choice-icon welcome-choice-icon-program" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v14H4z" /><path d="M8 3v4M16 3v4M4 10h16" /></svg>
              </span>
              <span class="welcome-choice-text">
                <span class="welcome-choice-name">Start from a program</span>
                <span id="welcome-program-sub" class="welcome-choice-sub">Ready-made plans for 3 to 6 days a week</span>
              </span>
              <svg class="welcome-choice-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </div>
        </div>

        <template v-else>
          <!-- Item 111: big tiles, and a tap starts the workout right away.
               RoutinePicker.vue draws them (issue #987: art tiles). -->
          <div class="card">
            <p v-if="programWelcomeShown" class="program-welcome" role="status">
              <span>Added {{ templates.programWelcome?.programName }}. Tap a routine to start your first workout.</span>
              <button type="button" class="link-button" @click="templates.programWelcome = null">
                Dismiss
              </button>
            </p>
            <h3 id="workout-template-label" class="picker-heading">What are you training today?</h3>
            <RoutinePicker
              :routines="templates.activeTemplates"
              :category-of="templates.categoryOf"
              :starting="starting"
              :selected-id="templateId"
              :glow-id="templates.programWelcome?.firstTemplateId ?? null"
              @start="startWith"
            />
            <button
              v-if="repeatCandidate"
              type="button"
              class="repeat-again"
              :disabled="starting"
              @click="startRepeat"
            >
              <span class="repeat-again-name">Do this again</span>
              <span class="repeat-again-sub">{{ repeatCandidate.date }}: {{ repeatCandidate.names }}</span>
            </button>
            <button type="button" class="link-button new-template-link" @click="openNewTemplate">
              + New routine
            </button>
          </div>
        </template>
      </template>
    </template>

    <div
      v-else
      class="active-workout-screen"
      @pointerdown="handleWorkoutPointerDown"
      @touchstart.passive="handleWorkoutTouchStart"
      @touchend="handleWorkoutTouchEnd"
      @touchcancel="handleWorkoutTouchCancel"
    >
        <div class="exercise-deck">
          <div v-if="workoutExerciseIds.length > 0" class="deck-controls">
            <div class="deck-dots" role="group" aria-label="Exercises in this workout">
              <button
                v-for="id in workoutExerciseIds"
                :key="id"
                type="button"
                class="deck-dot"
                :class="{ 'deck-dot-active': id === exerciseId }"
                :aria-label="exerciseName(id)"
                :aria-pressed="id === exerciseId"
                @click="selectExercise(id)"
              ></button>
            </div>
            <span class="exercise-card-position">{{ currentExerciseIndex + 1 }} / {{ workoutExerciseIds.length }}</span>
          </div>

          <div v-if="workoutExerciseIds.length > 0" class="deck-peek-row">
            <button
              type="button"
              class="deck-peek"
              aria-label="Previous exercise"
              :disabled="currentExerciseIndex <= 0"
              @click="goToPreviousExercise"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>

            <div class="exercise-card-viewport" :class="{ 'exercise-card-viewport-notes': selectedExerciseNotes }">
              <Transition :name="slideDirection >= 0 ? 'slide-next' : 'slide-prev'" @leave="handleCardLeaveStart">
                <div :key="exerciseId" class="exercise-card">
                  <div class="exercise-card-title-row">
                    <div class="exercise-card-name" :title="exerciseName(exerciseId)">{{ exerciseName(exerciseId) }}</div>
                    <button
                      v-if="canSwap(exerciseId)"
                      type="button"
                      class="notes-link swap-link"
                      aria-label="Swap exercise"
                      title="Swap exercise"
                      @click="openSwap(exerciseId)"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14l-4-4"/><path d="M20 16H6l4 4"/></svg>
                    </button>
                    <button
                      type="button"
                      class="notes-link"
                      :aria-label="selectedExerciseNotes ? 'Edit machine setup note' : 'Add machine setup note'"
                      :title="selectedExerciseNotes ? 'Edit machine setup note' : 'Add machine setup note'"
                      @click="editingNotesFor = exerciseId"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="2.2"/></svg>
                    </button>
                  </div>
                  <div class="exercise-card-footer">
                    <span>{{ setsLoggedLabel(exerciseId) }}</span>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      class="link-button history-link"
                      aria-label="View exercise history"
                      @click="viewingHistoryFor = exerciseId"
                    >
                      History
                    </button>
                  </div>
                  <p
                    v-if="selectedExerciseNotes"
                    class="setup-notes exercise-card-notes"
                    @click="editingNotesFor = exerciseId"
                  ><span class="exercise-card-notes-text">{{ selectedExerciseNotes }}</span></p>
                </div>
              </Transition>
            </div>

            <button
              type="button"
              class="deck-peek"
              aria-label="Next exercise"
              :disabled="currentExerciseIndex >= workoutExerciseIds.length - 1"
              @click="goToNextExercise"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>

          <div v-else class="card deck-empty">
            <p class="row-sub">No exercises yet. Add one to start logging.</p>
            <button type="button" class="btn-accent" @click="openAddExercise">Add your first exercise</button>
          </div>
        </div>

        <div v-if="exerciseId" class="card set-card">
          <!-- Issue #535: what this lift's note said last session. -->
          <p v-if="lastExerciseNote" class="exercise-day-note last-note" data-testid="last-note">
            <span class="note-kicker">Last time</span>
            <span class="exercise-day-note-text">{{ lastExerciseNote }}</span>
          </p>
          <!-- Larger-logging redesign: the lb/kg toggle gets its own line
               with full-size buttons instead of 22px pills squeezed beside
               the column label; the per-row "lb" suffix is gone to make room
               for bigger fields. -->
          <div v-if="!isSelectedExerciseTimed && !isSelectedExerciseLevel" class="unit-row">
            <span class="unit-row-label" aria-hidden="true">{{ selectedExerciseWeightFieldLabel }} in</span>
            <span class="unit-toggle" role="group" aria-label="Units">
              <button
                type="button"
                class="unit-btn"
                :class="{ 'unit-selected': rowWeightUnit === 'lb' }"
                :aria-pressed="rowWeightUnit === 'lb'"
                @click="setRowWeightUnit('lb')"
              >
                lb
              </button>
              <button
                type="button"
                class="unit-btn"
                :class="{ 'unit-selected': rowWeightUnit === 'kg' }"
                :aria-pressed="rowWeightUnit === 'kg'"
                @click="setRowWeightUnit('kg')"
              >
                kg
              </button>
            </span>
            <button v-if="showPlatesButton" type="button" class="plates-btn" @click="openPlateSheet">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M2 12h20" />
                <rect x="5" y="6" width="3" height="12" rx="1" fill="currentColor" />
                <rect x="16" y="6" width="3" height="12" rx="1" fill="currentColor" />
                <rect x="8.5" y="8.5" width="2" height="7" rx="0.8" fill="currentColor" />
                <rect x="13.5" y="8.5" width="2" height="7" rx="0.8" fill="currentColor" />
              </svg>
              Plates
              <!-- Issue #114: passive, the one nudge allowed mid-workout. -->
              <span v-if="showPremiumNudges && !hasPremium('plates')" class="premium-tag">Premium</span>
            </button>
          </div>
          <!-- Issue #141: a stall's note, and the lighter-week offer. The
               targets themselves sit on each open row (#160). Advice for the
               whole session, so only until this exercise's first set is in. -->
          <div
            v-if="selectedTarget && selectedTarget.stall !== 'none' && loggedCountFor(exerciseId) === 0"
            class="target-hint"
            data-testid="target-hint"
          >
            <p class="target-note">{{ selectedTarget.summary }}</p>
            <!-- Three missed targets, or a flat lift. -->
            <div v-if="selectedTarget.stall === 'offer' && selectedTarget.lighter" class="lighter-offer" role="group" aria-label="Lighter week">
              <p class="lighter-text">
                <strong>Lighter week?</strong> About 10% off for one session, then build back.
              </p>
              <div class="lighter-actions">
                <button type="button" class="lighter-take" @click="chooseLighterWeek(true)">
                  Take it: {{ formatTarget({ ...selectedTarget, weight: selectedTarget.lighter.weight, reps: selectedTarget.lighter.reps }) }}
                </button>
                <button type="button" class="lighter-skip" @click="chooseLighterWeek(false)">Not now</button>
              </div>
            </div>
          </div>
          <!-- Issue #142: a starting weight for a brand-new lift, saying where
               it came from, and the one-time sex question when body weight
               could set it. -->
          <div v-if="askStartSex" class="target-hint start-hint" data-testid="starting-weight-question">
            <p class="target-note"><strong>Want a starting weight from your body weight?</strong></p>
            <StrengthSexPicker />
          </div>
          <div v-else-if="startingWeight" class="target-hint start-hint" data-testid="starting-weight">
            <p class="start-kicker">Starting weight</p>
            <button
              v-if="startingWeight.weight !== null"
              type="button"
              class="start-fill"
              :aria-label="`Fill set 1 with starting weight ${formatWeight(startingWeight.weight)} ${startingWeight.unit} × ${startingWeight.reps}`"
              @click="fillStartingWeight"
            >
              <span class="set-target-value">{{ formatWeight(startingWeight.weight) }} {{ startingWeight.unit }} × {{ startingWeight.reps }}</span>
              <span class="target-tap" aria-hidden="true">Tap to fill</span>
            </button>
            <p class="target-note">{{ startingWeight.note }}</p>
          </div>
          <div v-if="warmupSets.length" class="warmup" data-testid="warmup">
            <button
              type="button"
              class="warmup-toggle"
              :aria-expanded="warmupOpen"
              aria-controls="warmup-list"
              @click="warmupOpen = !warmupOpen"
            >
              <span class="warmup-title">Warm-up</span>
              <span class="warmup-sub">{{ warmupSets.length }} {{ warmupSets.length === 1 ? 'set' : 'sets' }} up to {{ formatWeight(warmupTop!) }} {{ rowWeightUnit }}</span>
              <span class="warmup-chevron" aria-hidden="true">{{ warmupOpen ? '▴' : '▾' }}</span>
            </button>
            <ol v-if="warmupOpen" id="warmup-list" class="warmup-list" aria-label="Warm-up sets">
              <li v-for="(w, i) in warmupSets" :key="i">
                <button
                  v-if="showPlatesButton"
                  type="button"
                  class="warmup-line"
                  :aria-label="`Plates for warm-up ${w.bar ? 'bar' : `${formatWeight(w.weight)} ${rowWeightUnit}`} × ${w.reps}`"
                  @click="openWarmupPlates(w.weight)"
                >
                  <span>{{ w.bar ? `Bar (${formatWeight(w.weight)} ${rowWeightUnit})` : `${formatWeight(w.weight)} ${rowWeightUnit}` }} × {{ w.reps }}</span>
                  <span class="warmup-plates" aria-hidden="true">Plates</span>
                </button>
                <span v-else class="warmup-line">{{ formatWeight(w.weight) }} {{ rowWeightUnit }} × {{ w.reps }}</span>
              </li>
              <li class="warmup-foot">A guide only. Warm-ups aren't logged.</li>
            </ol>
          </div>
          <div v-if="isSelectedExerciseTimed && !useLabeledTimedFields" class="set-header-row">
            <span class="set-header-number" aria-hidden="true">Set</span>
            <span class="set-header-time" aria-hidden="true">Time</span>
            <span class="stopwatch-btn-spacer" aria-hidden="true"></span>
            <span class="set-header-rpe" aria-hidden="true">RPE</span>
            <span class="set-header-spacer" aria-hidden="true"></span>
          </div>
          <div v-else-if="!isSelectedExerciseTimed" class="set-header-row">
            <span class="set-header-number" aria-hidden="true">Set</span>
            <span class="set-header-weight" aria-hidden="true">{{ isSelectedExerciseLevel ? 'Level' : selectedExerciseWeightFieldLabel }}</span>
            <span class="set-header-reps" aria-hidden="true">Reps</span>
            <span class="set-header-rpe" aria-hidden="true">RPE</span>
            <span class="set-header-spacer" aria-hidden="true"></span>
          </div>

          <div ref="setRowsViewportEl" class="set-rows-viewport">
          <Transition
            :name="slideDirection >= 0 ? 'slide-next' : 'slide-prev'"
            @before-enter="handleSetRowsBeforeEnter"
            @before-leave="handleSetRowsBeforeLeave"
            @after-enter="handleSetRowsAfterEnter"
            @leave="handleSetRowsLeaveStart"
          >
          <div :key="exerciseId" class="set-rows-panel">
          <ul class="set-rows">
            <li
              v-for="entry in combinedRows"
              :key="entry.type === 'draft' ? entry.row.key : entry.set.id"
              class="set-row"
              :class="[
                entry.type === 'logged' ? 'set-row-logged' : entry.type === 'editing' ? 'set-row-editing' : 'set-row-draft',
                { 'set-row-stacked': entry.type !== 'logged' && isSelectedExerciseTimed && useLabeledTimedFields },
                { 'set-row-targeted': entry.type === 'draft' && !!targetByRowKey[entry.row.key] },
                { 'set-row-won': entry.type === 'logged' && !!setWinChip(entry.set.id) },
              ]"
            >
              <span v-if="!(entry.type !== 'logged' && isSelectedExerciseTimed && useLabeledTimedFields)" class="set-row-number" aria-hidden="true">{{ entry.number }}</span>

              <template v-if="entry.type === 'logged'">
                <!-- A logged reps-based set reads in the same columns as the
                     entry row below it (weight/level, reps, RPE, under the
                     shared header) -- the old "8 × BW + 120 lb" sentence put
                     reps first while the inputs put weight first, and a user
                     copying the row above typed each value into the wrong box.
                     The sentence stays for screen readers. -->
                <template v-if="!isSelectedExerciseTimed">
                  <span class="sr-only">
                    {{ formatSetLabel(selectedExerciseLoadType, entry.set.reps, entry.set.weight, entry.set.weight_unit, entry.set.level) }}<template v-if="entry.set.rpe !== null"> · RPE {{ entry.set.rpe }}</template>
                  </span>
                  <span class="set-logged-cell set-logged-weight" aria-hidden="true">
                    <template v-if="isSelectedExerciseLevel">{{ entry.set.level }}</template>
                    <template v-else>{{ entry.set.weight }}<span class="set-logged-unit">{{ entry.set.weight_unit }}</span></template>
                  </span>
                  <span class="set-logged-cell set-field-reps" aria-hidden="true">{{ entry.set.reps }}</span>
                  <span class="set-logged-cell set-logged-rpe set-field-rpe" aria-hidden="true">{{ entry.set.rpe ?? '–' }}</span>
                </template>
                <span v-else class="set-row-done">
                  {{ formatSetLabel(selectedExerciseLoadType, entry.set.reps, entry.set.weight, entry.set.weight_unit, entry.set.level, { durationSeconds: entry.set.duration_seconds, distance: entry.set.distance, distanceUnit: entry.set.distance_unit, incline: entry.set.incline, calories: entry.set.calories }) }}
                  <template v-if="entry.set.rpe !== null"> · RPE {{ entry.set.rpe }}</template>
                </span>
                <!-- Item 103: the pencil sits in the ✕ slot of the entry row
                     below, the green check stays in the ✓ slot. -->
                <span class="set-logged-actions">
                  <button
                    type="button"
                    class="edit-set-btn"
                    :aria-label="`Edit set ${entry.number}`"
                    @click="startEditingSet(entry.set)"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                  <span class="set-logged-check" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </span>
                <!-- Issue #475: the set's strongest small win, on a line of
                     its own under the values (mockup option A). -->
                <div v-if="setWinChip(entry.set.id)" class="set-win">
                  <SmallWinChip :win="setWinChip(entry.set.id)!" />
                </div>
              </template>

              <template v-else-if="isSelectedExerciseTimed && useLabeledTimedFields">
                <!-- Larger-logging redesign: 1+ tracked extras can't fit one
                     line at phone width with the bigger fields, so the row
                     stacks: "Set N" + Remove, then one field per line
                     (label | input | unit, a shared subgrid so everything
                     aligns -- item 101 follow-up), then a full-width Add
                     set button. -->
                <div class="set-row-body">
                  <div class="set-row-stacked-head">
                    <span class="set-row-stacked-title">Set {{ entry.number }}</span>
                    <button
                      v-if="entry.type === 'editing'"
                      type="button"
                      class="remove-row-btn-text"
                      :aria-label="`Delete set ${entry.number}`"
                      :disabled="entry.row.saving"
                      @click="confirmingDeleteSetId = entry.set.id"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      Delete
                    </button>
                    <button
                      v-else
                      type="button"
                      class="remove-row-btn-text"
                      :aria-label="`Remove row ${entry.number}`"
                      :disabled="entry.row.saving || !!entry.row.error"
                      @click="removeDraftRow(exerciseId, entry.row)"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
                      Remove
                    </button>
                  </div>
                  <div class="set-grid-fields">
                    <label class="set-grid-field">
                      <span class="sr-only">Time, minutes and seconds</span>
                      <span class="set-field-inline-label" aria-hidden="true">Time</span>
                      <input
                        :id="`row-duration-${entry.row.key}`"
                        :value="entry.row.durationInput"
                        :disabled="entry.row.saving"
                        type="text"
                        inputmode="numeric"
                        placeholder="0:00"
                        class="set-input-compact set-input-duration"
                        @input="handleDurationInput($event.target as HTMLInputElement, (v) => (entry.row.durationInput = v))"
                        @focus="selectInputText"
                      />
                      <button
                        v-if="entry.type === 'draft'"
                        type="button"
                        class="stopwatch-btn"
                        aria-label="Start timer"
                        :disabled="entry.row.saving"
                        @click="startStopwatch(exerciseId, entry.row)"
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="14" r="7" stroke="currentColor" stroke-width="2.2"/><path d="M12 14V10.5M10 3h4M12 3v4M18.5 7.5l1.5-1.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      </button>
                    </label>
                    <label v-if="selectedExerciseTracksDistance" class="set-grid-field">
                      <span class="set-field-inline-label" aria-hidden="true">Distance</span>
                      <input
                        :id="`row-distance-${entry.row.key}`"
                        v-model.number="entry.row.distance"
                        :disabled="entry.row.saving"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.1"
                        placeholder="0"
                        aria-label="Distance"
                        class="set-input-compact"
                        @focus="selectInputText"
                      />
                      <button
                        v-if="entry.type === 'editing'"
                        type="button"
                        class="unit-chip"
                        :aria-label="distanceUnitChipLabel(editDistanceUnit)"
                        @click="editDistanceUnit = editDistanceUnit === 'mi' ? 'km' : 'mi'"
                      >{{ editDistanceUnit }}</button>
                      <button
                        v-else
                        type="button"
                        class="unit-chip"
                        :aria-label="distanceUnitChipLabel(rowDistanceUnit)"
                        @click="toggleRowDistanceUnit"
                      >{{ rowDistanceUnit }}</button>
                    </label>
                    <label v-if="selectedExerciseTracksLevel" class="set-grid-field">
                      <span class="sr-only">Level</span>
                      <span class="set-field-inline-label" aria-hidden="true">Level</span>
                      <input
                        :id="`row-timed-level-${entry.row.key}`"
                        v-model.number="entry.row.level"
                        :disabled="entry.row.saving"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        step="1"
                        placeholder="0"
                        class="set-input-compact"
                        @focus="selectInputText"
                      />
                    </label>
                    <label v-if="selectedExerciseTracksIncline" class="set-grid-field">
                      <span class="set-field-inline-label" aria-hidden="true">Incline</span>
                      <input
                        :id="`row-incline-${entry.row.key}`"
                        v-model.number="entry.row.incline"
                        :disabled="entry.row.saving"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.5"
                        placeholder="0"
                        aria-label="Incline"
                        class="set-input-compact"
                        @focus="selectInputText"
                      />
                    </label>
                    <label v-if="selectedExerciseTracksCalories" class="set-grid-field">
                      <span class="set-field-inline-label" aria-hidden="true">Calories</span>
                      <input
                        :id="`row-calories-${entry.row.key}`"
                        v-model.number="entry.row.calories"
                        :disabled="entry.row.saving"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="1"
                        placeholder="0"
                        aria-label="Calories"
                        class="set-input-compact"
                        @focus="selectInputText"
                      />
                    </label>
                    <label class="set-grid-field">
                      <span class="sr-only">RPE (optional)</span>
                      <span class="set-field-inline-label" aria-hidden="true">RPE<span class="set-field-optional">optional</span></span>
                      <input
                        :id="`row-rpe-${entry.row.key}`"
                        v-model.number="entry.row.rpe"
                        :disabled="entry.row.saving"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        max="10"
                        step="0.5"
                        placeholder="–"
                        class="set-input-compact set-input-rpe-compact"
                        @focus="selectInputText"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    class="log-btn-wide"
                    :class="{ 'log-btn-compact-retry': entry.row.error }"
                    :aria-label="submitRowLabel(entry)"
                    :disabled="parseDurationLabel(entry.row.durationInput) === null || entry.row.saving"
                    @click="submitRow(entry)"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    {{ entry.row.saving ? 'Saving…' : entry.type === 'editing' ? 'Save' : entry.row.error ? 'Retry' : 'Add set' }}
                  </button>
                  <p v-if="entry.row.error" class="row-error">{{ entry.row.error }}</p>
                </div>
              </template>

              <template v-else-if="isSelectedExerciseTimed">
                <div class="set-row-body">
                <div class="set-row-line">
                  <label class="set-field set-field-time">
                    <span class="sr-only">Time, minutes and seconds</span>
                    <input
                      :id="`row-duration-${entry.row.key}`"
                      :value="entry.row.durationInput"
                      :disabled="entry.row.saving"
                      type="text"
                      inputmode="numeric"
                      placeholder="0:00"
                      class="set-input-compact set-input-duration"
                      @input="handleDurationInput($event.target as HTMLInputElement, (v) => (entry.row.durationInput = v))"
                      @focus="selectInputText"
                    />
                  </label>
                  <button
                    v-if="entry.type === 'draft'"
                    type="button"
                    class="stopwatch-btn"
                    aria-label="Start timer"
                    :disabled="entry.row.saving"
                    @click="startStopwatch(exerciseId, entry.row)"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="14" r="7" stroke="currentColor" stroke-width="2.2"/><path d="M12 14V10.5M10 3h4M12 3v4M18.5 7.5l1.5-1.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                  <span v-else class="stopwatch-btn-spacer" aria-hidden="true"></span>
                  <label class="set-field set-field-rpe">
                    <span class="sr-only">RPE (optional)</span>
                    <input
                      :id="`row-rpe-${entry.row.key}`"
                      v-model.number="entry.row.rpe"
                      :disabled="entry.row.saving"
                      type="number"
                      inputmode="decimal"
                      min="0"
                      max="10"
                      step="0.5"
                      placeholder="–"
                      class="set-input-compact set-input-rpe-compact"
                      @focus="selectInputText"
                    />
                  </label>
                  <span class="set-row-actions-compact">
                    <button
                      v-if="entry.type === 'editing'"
                      type="button"
                      class="remove-row-btn-compact"
                      :aria-label="`Delete set ${entry.number}`"
                      :disabled="entry.row.saving"
                      @click="confirmingDeleteSetId = entry.set.id"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button
                      v-else
                      type="button"
                      class="remove-row-btn-compact"
                      :aria-label="`Remove row ${entry.number}`"
                      :disabled="entry.row.saving || !!entry.row.error"
                      @click="removeDraftRow(exerciseId, entry.row)"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
                    </button>
                    <button
                      type="button"
                      class="log-btn-compact"
                      :class="{ 'log-btn-compact-retry': entry.row.error }"
                      :aria-label="submitRowLabel(entry)"
                      :disabled="parseDurationLabel(entry.row.durationInput) === null || entry.row.saving"
                      @click="submitRow(entry)"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  </span>
                </div>
                <p v-if="entry.row.error" class="row-error">{{ entry.row.error }}</p>
                </div>
              </template>

              <template v-else>
                <div class="set-row-body">
                <div class="set-row-line" @input="clearRowCheck(entry.row)">
                  <label v-if="isSelectedExerciseLevel" class="set-field set-field-weight">
                    <span class="sr-only">Level</span>
                    <input
                      :id="`row-level-${entry.row.key}`"
                      v-model.number="entry.row.level"
                      :disabled="entry.row.saving"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      step="1"
                      placeholder="0"
                      class="set-input-compact"
                      @focus="selectInputText"
                    />
                  </label>
                  <label v-else class="set-field set-field-weight">
                    <span class="sr-only">{{ selectedExerciseWeightFieldLabel }}</span>
                    <input
                      :id="`row-weight-${entry.row.key}`"
                      v-model.number="entry.row.weight"
                      :disabled="entry.row.saving"
                      type="number"
                      inputmode="decimal"
                      min="0"
                      step="0.5"
                      placeholder="0"
                      class="set-input-compact"
                      @focus="selectInputText"
                    />
                  </label>
                  <label class="set-field set-field-reps">
                    <span class="sr-only">Reps</span>
                    <input
                      :id="`row-reps-${entry.row.key}`"
                      v-model.number="entry.row.reps"
                      :disabled="entry.row.saving"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      placeholder="0"
                      class="set-input-compact"
                      @focus="selectInputText"
                    />
                  </label>
                  <label class="set-field set-field-rpe">
                    <span class="sr-only">RPE (optional)</span>
                    <input
                      :id="`row-rpe-${entry.row.key}`"
                      v-model.number="entry.row.rpe"
                      :disabled="entry.row.saving"
                      type="number"
                      inputmode="decimal"
                      min="0"
                      max="10"
                      step="0.5"
                      placeholder="–"
                      class="set-input-compact set-input-rpe-compact"
                      @focus="selectInputText"
                    />
                  </label>
                  <span class="set-row-actions-compact">
                    <button
                      v-if="entry.type === 'editing'"
                      type="button"
                      class="remove-row-btn-compact"
                      :aria-label="`Delete set ${entry.number}`"
                      :disabled="entry.row.saving"
                      @click="confirmingDeleteSetId = entry.set.id"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <button
                      v-else
                      type="button"
                      class="remove-row-btn-compact"
                      :aria-label="`Remove row ${entry.number}`"
                      :disabled="entry.row.saving || !!entry.row.error"
                      @click="removeDraftRow(exerciseId, entry.row)"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
                    </button>
                    <button
                      type="button"
                      class="log-btn-compact"
                      :class="{ 'log-btn-compact-retry': entry.row.error }"
                      :aria-label="submitRowLabel(entry)"
                      :disabled="entry.row.reps === null || (isSelectedExerciseLevel && entry.row.level === null) || (isSelectedExerciseWeightRequired && entry.row.weight === null) || entry.row.saving"
                      @click="submitRow(entry)"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  </span>
                </div>
                <!-- Issue #160: this row's own target, under its inputs. -->
                <template v-if="entry.type === 'draft' && targetByRowKey[entry.row.key]">
                  <template v-for="t in [targetByRowKey[entry.row.key]]" :key="entry.row.key">
                    <div class="set-target" data-testid="set-target">
                      <button
                        type="button"
                        class="set-target-fill"
                        :aria-label="`Fill set ${entry.number} with target ${formatTarget(t)}`"
                        :disabled="entry.row.saving"
                        @click="fillSetTarget(entry.row, t)"
                      >
                        <span class="target-kicker">{{ t.label }}</span>
                        <span class="set-target-value">{{ formatTarget(t) }}</span>
                        <span class="target-tap" aria-hidden="true">Tap to fill</span>
                      </button>
                      <button
                        type="button"
                        class="set-target-why-btn"
                        :aria-label="`Why this target for set ${entry.number}?`"
                        :aria-expanded="targetWhyRowKey === entry.row.key"
                        :aria-controls="`set-target-why-${entry.row.key}`"
                        @click="targetWhyRowKey = targetWhyRowKey === entry.row.key ? null : entry.row.key"
                      >
                        Why?
                      </button>
                    </div>
                    <div v-if="targetWhyRowKey === entry.row.key" :id="`set-target-why-${entry.row.key}`" class="set-target-why">
                      <p v-for="line in t.why" :key="line">{{ line }}</p>
                    </div>
                  </template>
                </template>
                <!-- Issue #336: an unlikely weight asks before it's saved. -->
                <WeightTypoWarning
                  v-if="entry.row.confirm"
                  :message="entry.row.confirm"
                  :save-label="entry.type === 'editing' ? 'Save anyway' : 'Log anyway'"
                  @fix-it="fixRowCheck(entry.row)"
                  @save-anyway="confirmRowCheck(entry)"
                />
                <p v-if="entry.row.notice || entry.row.error" class="row-error">{{ entry.row.notice || entry.row.error }}</p>
                </div>
              </template>

              <!-- Item 103: below an edited set's inputs, Cancel plus that
                   set's own lb/kg (units are per set, see startEditingSet) --
                   or, once Delete is tapped, item 51's confirm step in its
                   place, so there's never a second Cancel in the row. -->
              <template v-if="entry.type === 'editing'">
                <div v-if="confirmingDeleteSetId === entry.set.id" class="confirm-delete set-edit-below">
                  <span class="row-sub">Delete this set? This can't be undone.</span>
                  <div class="confirm-actions">
                    <button type="button" class="danger small" @click="handleDeleteSet(entry.set.id)">Confirm delete</button>
                    <button type="button" class="ghost small" @click="confirmingDeleteSetId = null">Cancel</button>
                  </div>
                </div>
                <div v-else class="set-edit-footer set-edit-below">
                  <button type="button" class="link-button set-edit-cancel" @click="cancelEditingSet">Cancel</button>
                  <span
                    v-if="!isSelectedExerciseTimed && !isSelectedExerciseLevel"
                    class="unit-toggle"
                    role="group"
                    :aria-label="`Units for set ${entry.number}`"
                  >
                    <button
                      v-for="unit in (['lb', 'kg'] as const)"
                      :key="unit"
                      type="button"
                      class="unit-btn"
                      :class="{ 'unit-selected': editWeightUnit === unit }"
                      :aria-pressed="editWeightUnit === unit"
                      @click="setEditWeightUnit(unit)"
                    >
                      {{ unit }}
                    </button>
                  </span>
                </div>
              </template>
            </li>
          </ul>

          <button type="button" class="add-row-btn" @click="addDraftRow(exerciseId)">+ Add row</button>
          </div>
          </Transition>
          </div>
          <!-- Issue #535: a note on this lift for this workout only. -->
          <div class="today-note" data-testid="today-note">
            <form v-if="editingTodayNote" class="today-note-form" @submit.prevent="saveTodayNote">
              <label for="today-note-input" class="note-kicker">Note for today</label>
              <textarea
                id="today-note-input"
                ref="todayNoteInput"
                v-model="todayNoteDraft"
                rows="2"
                maxlength="500"
                placeholder="How this lift went today"
              ></textarea>
              <p class="today-note-hint">Shows here next time. Seat height and other machine settings go in the machine setup note, the pencil by the name.</p>
              <p v-if="todayNoteError" class="row-error">{{ todayNoteError }}</p>
              <div class="today-note-actions">
                <button type="submit" class="btn-accent today-note-save" :disabled="todayNoteSaving">
                  {{ todayNoteSaving ? 'Saving…' : 'Save note' }}
                </button>
                <button type="button" class="ghost small" @click="editingTodayNote = false">Cancel</button>
              </div>
            </form>
            <button
              v-else-if="todayExerciseNote"
              type="button"
              class="exercise-day-note today-note-saved"
              aria-label="Change today's note"
              @click="startTodayNote"
            >
              <span class="note-kicker">Today</span>
              <span class="exercise-day-note-text">{{ todayExerciseNote }}</span>
            </button>
            <button v-else type="button" class="today-note-add" @click="startTodayNote">+ Note for today</button>
          </div>
        </div>

    </div>
    </template>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <RecordCelebration
      v-if="recordCelebration"
      :exercise-name="exerciseName(recordCelebration.exerciseId)"
      :reps="recordCelebration.reps"
      :weight="recordCelebration.weight"
      :weight-unit="recordCelebration.weightUnit"
      :level="recordCelebration.level"
      :load-type="recordCelebration.loadType"
      :effective-load="recordCelebration.effectiveLoad"
      :previous-best="recordCelebration.previousBest"
      :first-ever="recordCelebration.firstEver"
      :win="recordCelebration.win"
      @dismiss="recordCelebration = null"
    />

    <UnlockCelebration v-if="unlockTiers.length > 0 && !workout.finishUnlockShown" :tiers="unlockTiers" @done="workout.finishUnlockShown = true" />

    <BodyStatsModal
      v-if="showMissingWeightModal"
      :weight="null"
      :weight-unit="profile.defaultWeightUnit"
      :height="null"
      :height-unit="null"
      hide-height
      heading="Add your body weight"
      intro="This exercise uses your body weight to calculate how much you lifted."
      show-not-now
      show-dont-ask-again
      @save="handleMissingWeightSave"
      @dismiss="handleMissingWeightDismiss"
      @opt-out="handleMissingWeightOptOut"
      @close="handleMissingWeightDismiss"
    />

    <BodyStatsModal
      v-if="showWeighInReminderModal"
      :weight="bodyWeight.latestEntry?.weight ?? null"
      :weight-unit="bodyWeight.latestEntry?.weight_unit ?? profile.defaultWeightUnit"
      :height="null"
      :height-unit="null"
      hide-height
      heading="Time for a weigh-in?"
      intro="Keep your progress and volume accurate with a fresh weight."
      show-not-now
      show-dont-ask-again
      show-bunny
      @save="handleWeighInReminderSave"
      @dismiss="handleWeighInReminderDismiss"
      @opt-out="handleWeighInReminderOptOut"
      @close="handleWeighInReminderDismiss"
    />

    <RestTimer
      v-if="activeRest && !restMinimized"
      :exercise-name="activeRest.exerciseName"
      :ends-at="activeRest.endsAt"
      :total-seconds="activeRest.totalSeconds"
      :up-next-name="restUpNextName"
      :headline="activeRest.headline"
      :wins="restWins"
      @dismiss="skipRest"
      @finish="handleRestTimerFinish"
      @minimize="rest.minimize()"
      @adjust="rest.adjust"
      @edit-exercise-rest="editExerciseRestFromRest"
      @edit-default-rest="editDefaultRestFromRest"
    />

    <ExerciseFormSheet
      v-if="restEditExercise"
      :key="restEditExercise.id"
      :exercise="restEditExercise"
      focus-rest
      @saved="restEditExercise = null"
      @dismiss="restEditExercise = null"
    />

    <SetStopwatch
      v-if="stopwatch"
      :exercise-name="stopwatch.exerciseName"
      :started-at="stopwatch.startedAt"
      :goal-seconds="stopwatch.goalSeconds"
      :set-label="stopwatch.setLabel"
      :last-time-label="stopwatch.lastTimeLabel"
      @stop="stopStopwatch"
      @cancel="stopwatch = null"
    />

    <ExerciseHistoryDetail
      v-if="viewingHistoryFor"
      :exercise-id="viewingHistoryFor"
      @dismiss="viewingHistoryFor = null"
    />

    <SetupNotesSheet
      v-if="editingNotesFor"
      :exercise-id="editingNotesFor"
      :exercise-name="exerciseName(editingNotesFor)"
      :notes="exercises.exercises.find((e) => e.id === editingNotesFor)?.setup_notes ?? null"
      @dismiss="editingNotesFor = null"
    />

    <ExerciseSwapSheet
      v-if="swappingFor"
      :exercise-id="swappingFor"
      :deck-ids="workoutExerciseIds"
      :busy="swapBusy"
      :error="swapError"
      @pick="handleSwapPick"
      @dismiss="swappingFor = null"
    />

    <PlateCalculatorSheet
      v-if="plateSheetOpen && selectedExercise && (plateWarmupWeight !== null || plateTarget)"
      :exercise="selectedExercise"
      :unit="plateWarmupWeight !== null ? rowWeightUnit : plateTarget!.unit"
      :initial-weight="plateWarmupWeight ?? plateTarget!.row.weight"
      @use="usePlateWeight"
      @dismiss="plateSheetOpen = false"
    />

    <div
      v-if="newTemplateOpen"
      class="new-template-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="New routine"
      @click.self="newTemplateOpen = false"
      @keydown.esc="newTemplateOpen = false"
    >
      <form class="card new-template-card" @submit.prevent="createWelcomeTemplate">
        <h3 class="new-template-title">New routine</h3>
        <label for="welcome-template-name">Name</label>
        <input id="welcome-template-name" v-model="newTemplateName" type="text" placeholder="e.g. Push Day" required autofocus />
        <p v-if="newTemplateError" class="error">{{ newTemplateError }}</p>
        <div class="confirm-actions new-template-actions">
          <button type="submit" class="btn-accent new-template-next">Next</button>
          <button type="button" class="ghost small" @click="newTemplateOpen = false">Cancel</button>
        </div>
      </form>
    </div>

    <AddExerciseSheet
      v-if="addingExercise"
      :exercises="candidateExercisesForSheet"
      :recent-ids="workout.recentlyLoggedExerciseIds"
      :allow-create="!workout.activeTemplateId"
      multi-pick
      :first-run="exercises.activeExercises.length === 0"
      :added="sheetPicksAdded"
      @select="handleSheetSelect"
      @deselect="handleSheetDeselect"
      @dismiss="closeAddExercise"
      @manage="handleSheetManage"
    />

    <!-- Larger-logging redesign: one fixed dock above BottomNav holds the
         rest mini-bar (when resting) and, during a workout, Finish -- so the
         two stack instead of overlapping, and Finish never scrolls away. -->
    <div v-if="showWorkoutDock || (activeRest && restMinimized)" class="bottom-dock">
      <RestMiniBar v-if="activeRest && restMinimized" @resume="restMinimized = false" @skip="skipRest" />
      <div v-if="showWorkoutDock" class="workout-dock">
        <p v-if="upNextToast" class="dock-note up-next-toast" role="status">Up next: {{ upNextToast }}</p>
        <p v-else-if="allPlannedSetsDone" class="dock-note" role="status">All planned sets done</p>
        <div v-if="confirmingEmptyFinish" class="confirm-delete">
          <span class="row-sub">Finish with no sets logged? This will discard the workout.</span>
          <div class="confirm-actions">
            <button type="button" class="danger small" @click="handleFinish">Discard workout</button>
            <button type="button" class="ghost small" @click="confirmingEmptyFinish = false">Cancel</button>
          </div>
        </div>
        <p v-else-if="autoFinishing" class="dock-note finishing-note" role="status">Finishing workout…</p>
        <button v-else type="button" class="finish-dock-btn" :disabled="hasUnconfirmedSet" @click="handleFinishClick">Finish workout</button>
        <p v-if="hasUnconfirmedSet" class="row-error">Retry the unconfirmed set before finishing.</p>
      </div>
    </div>
    <FinishEarlyDialog
      v-if="confirmingEarlyFinish"
      :workout-name="activeTemplateName ?? 'Freeform workout'"
      :exercises="unfinishedExercises"
      @cancel="confirmingEarlyFinish = false"
      @finish="handleFinish"
    />
  </div>
</template>

<style scoped>
/* Larger-logging redesign: fixed stack sitting exactly on top of BottomNav
   (--bottom-nav-height, style.css), holding the rest mini-bar and/or the
   pinned Finish dock. */
.bottom-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px));
  z-index: 20;
  max-width: var(--page-max);
  margin: 0 auto;
  background: var(--bg);
}

.workout-dock {
  padding: 10px 16px;
  border-top: 1px solid var(--border);
}

/* Item 104: auto-advance's "Up next" toast / "All planned sets done". */
.dock-note {
  margin: 0 0 8px;
  text-align: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-dim);
}

.up-next-toast {
  color: var(--accent);
}

/* Item 109: stands in for the Finish button during the auto-finish moment. */
.finishing-note {
  min-height: 52px;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.workout-dock .confirm-delete {
  margin: 0;
}

.workout-dock .row-error {
  margin-top: 6px;
}

.finish-dock-btn {
  width: 100%;
  min-height: 52px;
  margin-top: 0;
  font-size: 1.1rem;
  font-weight: 700;
  background: transparent;
  border: 1.5px solid var(--border);
  color: var(--text);
}

/* Room below the last card so the pinned dock never covers it. */
.active-workout-screen {
  padding-bottom: 88px;
}

.log-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

/* Larger-logging redesign: the active workout's one-row header (App.vue
   hides its regular Account-only row meanwhile). Title truncates rather than
   wrapping so the row stays one line for long template names. Issue #492:
   at a large Android font size the clock and buttons left the title no room
   at all, so once it can't get 5rem the title takes its own line and the
   rest wraps under it, right-aligned. */
.log-header-workout {
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 16px;
  margin-bottom: 14px;
}

.log-header-workout .workout-title {
  flex: 1 1 5rem;
  min-width: 0;
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.log-header-workout .elapsed-time {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 1.3rem;
}

.header-icon-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  min-height: 0;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-add-btn {
  flex-shrink: 0;
  height: 44px;
  min-height: 0;
  padding: 0 12px 0 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Redesign item 67 follow-up: the carousel's swipe gesture is bound here
   (handleWorkoutPointerDown/Up in the script) rather than just on the
   exercise card, so a drag starting anywhere over the set rows, notes, etc.
   still moves the carousel -- not just one confined to the small card.
   `touch-action: pan-y` keeps a vertical drag scrolling the page normally
   while stopping the browser from treating a horizontal one as its own
   scroll/navigation gesture before the pointer handlers see it. */
.active-workout-screen {
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
}

.elapsed-time {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.progress-strip {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.stat-tile {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-eyebrow {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: var(--text-dim);
  text-transform: uppercase;
}

.stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stat-tile-week .stat-value {
  font-family: var(--font-display);
}

.stat-value-unit {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-dim);
}

.paw-tracker {
  display: flex;
  gap: 5px;
  margin-top: 10px;
}

.paw-day {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text) 8%, transparent);
  flex-shrink: 0;
}

.paw-day-done {
  background: none;
}

.stat-tile-pr {
  position: relative;
  background: color-mix(in srgb, var(--success) 14%, transparent);
  border-color: color-mix(in srgb, var(--success) 30%, transparent);
  padding-top: 16px;
}

.stat-tile-pr .stat-value {
  font-family: var(--font-display);
  font-size: 1rem;
  color: var(--success);
}

.stat-tile-pr .stat-label {
  color: var(--text);
  white-space: normal;
}

.pr-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--highlight) 22%, transparent);
  color: var(--highlight);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.3px;
}

.pr-detail {
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--success) 55%, var(--text));
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 20px;
}

/* Issue #207: the welcome card, design docs/design/issue-207-first-run.html
   option B. */
.welcome-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.mascot {
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}

.mascot-lg {
  width: 80px;
  height: 80px;
}

.mascot-lg img {
  width: 54px;
  height: 54px;
  border-radius: 12px;
}

.mascot-sm {
  width: 40px;
  height: 40px;
}

.mascot-sm img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.welcome-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--text);
}

.welcome-copy {
  margin: 2px 0 0;
  font-size: 0.88rem;
  color: var(--text-dim);
}

.welcome-choices {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.welcome-choice {
  width: 100%;
  min-height: 0;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  text-align: left;
  font-weight: 400;
}

.welcome-choice-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.welcome-choice-primary:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.welcome-choice-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent-text) 14%, transparent);
}

.welcome-choice-icon-template {
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  color: var(--secondary);
}

.welcome-choice-icon-program {
  background: color-mix(in srgb, var(--highlight) 16%, transparent);
  color: var(--highlight);
}

.welcome-choice-text {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
}

.welcome-choice-name {
  font-weight: 700;
  font-size: 0.95rem;
}

.welcome-choice-sub {
  font-size: 0.8rem;
  line-height: 1.35;
  color: var(--text-dim);
}

.welcome-choice-primary .welcome-choice-sub {
  color: color-mix(in srgb, var(--accent-text) 78%, transparent);
}

.welcome-choice-chevron {
  flex-shrink: 0;
  color: var(--text-dim);
}

.welcome-choice-primary .welcome-choice-chevron {
  color: var(--accent-text);
}

.welcome-label {
  margin: 6px 0 -2px 2px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* Issue #207: Build a routine's name sheet, as on the Templates screen. */
.new-template-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 16px;
}

.new-template-card {
  width: 100%;
  max-width: 480px;
}

.new-template-title {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: 1.2rem;
}

.new-template-actions {
  margin-top: 16px;
}

.new-template-next {
  flex: 1;
  margin-top: 0;
}

/* Issue #207: the recap's save-as-template offer. */
.save-offer {
  margin-bottom: 0;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}

.save-offer-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.save-offer-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}

.save-offer-copy {
  margin: 2px 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.save-offer-label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
}

.save-offer .confirm-actions {
  margin-top: 10px;
  flex-wrap: wrap;
}

.save-offer-save {
  flex: 1;
  margin-top: 0;
}

.routine-update-title {
  overflow-wrap: anywhere;
}

.routine-update-list {
  margin: 0 -2px;
}

.routine-update-row {
  position: relative;
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 2px;
  border-top: 1px solid var(--border);
  cursor: pointer;
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 400;
  line-height: 1.35;
}

.routine-update-row:first-child {
  border-top: none;
}

.routine-update-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  min-height: 0;
  margin: 0;
  padding: 0;
}

.routine-update-row:has(.routine-update-input:focus-visible) {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.routine-update-check {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 6px;
  border: 1.5px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
}

.routine-update-row.on .routine-update-check {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.routine-update-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.routine-update-text b {
  font-weight: 800;
}

.routine-update-dim {
  color: var(--text-dim);
}

.save-offer-saved {
  margin: 0;
  font-size: 0.85rem;
  color: var(--success);
}

.link-button {
  display: inline;
  min-height: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  text-decoration: underline;
}

.history-link {
  display: block;
  margin: 4px 0 0;
  font-size: 0.85rem;
}

.empty {
  text-align: center;
  padding: 24px 0;
}

.row-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.confirm-delete {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-actions {
  display: flex;
  gap: 8px;
}

.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--accent-text);
}

.btn-accent.small {
  width: auto;
  margin-top: 0;
  min-height: 36px;
  padding: 0 12px;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.danger.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.ghost.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.picker-heading {
  margin: 0 0 12px;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
}

.program-welcome {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
  font-size: 0.85rem;
  color: var(--success);
}

.repeat-again {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  margin-top: 12px;
  padding: 12px 14px;
  text-align: left;
  border: 1px dashed var(--border);
  border-radius: 14px;
  background: transparent;
  color: inherit;
}

.repeat-again-name {
  font-weight: 600;
}

.repeat-again-sub {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
  opacity: 0.7;
}

.change-workout {
  display: block;
  margin: -4px 0 10px;
  font-size: 0.85rem;
}

.new-template-link {
  display: inline-block;
  margin-top: 14px;
  font-size: 0.85rem;
}

.error {
  color: var(--danger);
}

/* Issue #535: a lift's note for one session ("Last time" above the rows,
   today's below them). Unlike setup notes it reads as a dated remark: a
   small kicker, then the text. */
.exercise-day-note {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  margin: 0 0 10px;
  padding: 8px 12px;
  border: none;
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
  text-align: left;
}

.note-kicker {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.exercise-day-note-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.today-note {
  margin-top: 10px;
}

.today-note-saved {
  min-height: 44px;
  margin: 0;
  cursor: pointer;
}

.today-note-add {
  min-height: 44px;
  padding: 0 4px;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
}

.today-note-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.today-note-form textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
}

.today-note-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.today-note-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.today-note-save {
  min-height: 44px;
}

.setup-notes {
  display: flex;
  align-items: center;
  min-height: 48px;
  font-size: 0.8rem;
  color: var(--text-dim);
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin: 8px 0 4px;
  white-space: pre-wrap;
}

/* Redesign item 67: swipeable exercise carousel replacing the suggested-chip
   row and the exercise <select>. Dots pick an exercise directly; the peek
   buttons step one at a time; the card itself also responds to a
   left/right drag via pointer events (handlePointerDown/Up in the script). */
.exercise-deck {
  margin-bottom: 14px;
}

.deck-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 16px 10px;
}

.deck-dots {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  justify-content: center;
}

.deck-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  min-height: 0;
  border-radius: 4px;
  background: var(--border);
  border: none;
  transition: width 0.15s ease, background-color 0.15s ease;
}

.deck-dot-active {
  width: 24px;
  background: var(--accent);
}

.deck-peek-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

/* Larger-logging redesign: the peeks were 26px slivers with 12px chevrons;
   now full 44px-wide arrow buttons flanking a slim strip (96px, up from a
   150px card that was mostly empty space). Issue #492: they stretch to the
   card's height, which grows with the font size. */
.deck-peek {
  flex-shrink: 0;
  width: 44px;
  min-height: 96px;
  padding: 0;
  border-radius: 16px;
  background: var(--surface-2);
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.deck-peek:disabled {
  opacity: 0.35;
}

/* Issue #88: tall enough for a two-line name, the footer, and a two-line
   (clamped) note. The doubled class outranks .exercise-card-viewport's own
   min-height below, which used to win and left the card at 96px. */
.exercise-card-viewport.exercise-card-viewport-notes,
.deck-peek-row:has(.exercise-card-viewport-notes) .deck-peek {
  min-height: 168px;
}

/* Top-aligned so anything that still doesn't fit clips the note at the
   bottom (tap it for the full text) instead of the name at the top. */
.exercise-card-viewport-notes .exercise-card {
  justify-content: flex-start;
}

/* Clips the crossing-slide transition below to the card's rounded corners.
   Every card sits in the same grid cell, so the outgoing and incoming cards
   occupy the same box at once and visibly cross. Issue #492: this used to be
   a fixed 96px with both cards absolute, which cut the name and footer off
   at a large Android font size; the shared cell lets the card grow to fit
   while keeping 96px as its floor. */
.exercise-card-viewport {
  display: grid;
  flex: 1;
  min-width: 0;
  min-height: 96px;
  border-radius: 18px;
  overflow: hidden;
}

.exercise-card {
  grid-area: 1 / 1;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

/* Redesign item 67 follow-up: swiping/tapping a dot used to swap the
   exercise card's content instantly, easy to miss as "nothing happened" at
   a glance, then just faded/nudged one card out before fading the next one
   in (out-in). This is a true crossing slide instead: default (non-out-in)
   Transition mode runs enter and leave at the same time, and sharing one
   grid cell (.exercise-card-viewport above; it was `position: absolute`
   for the transition's duration until issue #492) is what lets the
   outgoing and incoming cards occupy the same box simultaneously and
   actually pass each other, like the mockup's own deck-of-cards feel,
   rather than a static swap with a bit of motion on top. This is safe for
   this read-only card (position/name/notes/sets-logged, no form inputs) --
   see setRowsPanelEl's watcher above for why the larger set-rows panel
   deliberately does NOT get this same treatment (briefly having two copies
   of a live, editable row would risk a real gap where a fast keystroke
   lands on the wrong exercise's fields, not just a cosmetic issue). */
.slide-next-enter-active,
.slide-next-leave-active,
.slide-prev-enter-active,
.slide-prev-leave-active {
  transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

/* The set rows' crossing still goes absolute (see setRowsViewportEl). */
.set-rows-panel.slide-next-enter-active,
.set-rows-panel.slide-next-leave-active,
.set-rows-panel.slide-prev-enter-active,
.set-rows-panel.slide-prev-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.slide-next-enter-from {
  transform: translateX(100%);
}

.slide-next-leave-to {
  transform: translateX(-100%);
}

.slide-prev-enter-from {
  transform: translateX(-100%);
}

.slide-prev-leave-to {
  transform: translateX(100%);
}

.exercise-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notes-link {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-height: 0;
  margin: -6px -8px -6px -4px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: none;
  color: var(--accent);
}

/* Issue #150: sits just left of the pencil, sharing its padding so the name
   keeps as much width as it can. */
.swap-link {
  margin-right: -10px;
}

.exercise-card-position {
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-dim);
  font-size: 0.85rem;
  font-weight: 800;
}

/* Up to two lines (then ellipsis). Issue #273: the position pill lives in
   the dot row above the card, so the name shares its row only with the swap
   and pencil icons and a three-word name like "Barbell Bench Press" fits in
   two lines at 375px. The title attribute keeps the full name available.
   Issue #492: past 7vw (the normal size on any phone) it stops growing, or a
   large Android font size left room for half a word per line. */
.exercise-card-name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-display, inherit);
  font-size: min(1.3rem, 7vw);
  font-weight: 800;
  line-height: 1.1;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow-wrap: break-word;
}

.exercise-card-notes {
  flex-shrink: 0;
  min-height: 0;
  margin: 2px 0;
  cursor: pointer;
}

.exercise-card-notes-text {
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow-wrap: anywhere;
}

/* Issue #492: wraps History (or the count, at the largest font size) to
   its own line when the row can't fit it. */
.exercise-card-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 6px;
  font-size: 0.95rem;
  color: var(--text-dim);
}

.exercise-card-footer .history-link {
  display: inline;
  margin: 0;
  font-size: inherit;
}

.deck-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Larger-logging redesign (2026-09-28): the set card and everything in it
   were sized for density -- 10px uppercase column labels, 28px-tall
   underlined inputs, 26px circular action buttons -- and hard to read
   without glasses. Everything below is sized up: 15px sentence-case labels,
   52px boxed inputs with ~22px digits, and 48x52 / 36x52 action buttons
   (tap targets at or above the 44px guideline). Mockup: the "RepBunny
   Larger Logging" canvas, "Strength/Timed: bigger fields, pinned Finish".

   Width budget at a 375px phone: 343px content, minus the set card's 8px
   padding and the row's 8px padding (+1px borders each) leaves 307px for
   number (28) + weight (flex) + reps (54) + RPE (44) + actions (88) + gaps,
   so the weight field gets ~69px. That's why the per-row "lb" suffix went
   away (the unit lives on its own line above the header instead), and why
   timed rows with any tracked extra stack one field per line. */
.set-card {
  padding: 8px;
}

.unit-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  padding: 4px 4px 10px;
}

/* Issue #22: wraps under the lb/kg toggle when the row is too narrow. */
.plates-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--secondary) 55%, var(--border));
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  color: var(--secondary);
  font-size: 0.9rem;
  font-weight: 800;
}

.premium-tag {
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.unit-row-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-dim);
}

/* Column headers (Set/Weight/Reps/RPE), widths mirroring the row fields'
   own widths so each label sits over its column. The row's 8px padding +
   1px border is why this row's side padding is 9px. */
/* Issue #141: Premium's stall card above the set rows: what a stall changed,
   and the lighter-week offer. */
.target-hint {
  margin: 0 4px 10px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

/* Issue #160: a target chip under each open row's inputs (mockup:
   docs/design/issue-160-per-set-targets.html, option B). It lives in
   .set-row-body, so it starts under the Weight column and spans to the ✓
   button: ~273px at 375px, less the Why? button (~56px). The row's number
   stays level with the inputs instead of centering on the taller row. */
.set-row.set-row-targeted {
  align-items: flex-start;
}

.set-row-targeted .set-row-number {
  margin-top: 12px;
}

.set-target {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.set-target-fill {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  column-gap: 8px;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--text);
  text-align: left;
  font-weight: normal;
}

.target-kicker {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

.set-target-value {
  font-family: var(--font-display);
  font-size: 1.02rem;
  font-weight: 700;
  white-space: nowrap;
}

.target-tap {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--text-dim);
  white-space: nowrap;
}

.set-target-why-btn {
  flex-shrink: 0;
  min-height: 40px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-dim);
  font-size: 0.76rem;
  font-weight: 700;
}

.set-target-why-btn[aria-expanded='true'] {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}

.set-target-why p {
  margin: 0 0 3px;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.target-note {
  margin: 0;
  padding: 2px 8px 4px;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text);
}

/* Issue #142: starting weight for a brand-new lift, and the warm-up guide. */
.start-hint {
  padding: 8px;
}

.start-hint .sex-picker {
  padding: 0 8px 4px;
}

.start-kicker {
  margin: 0 8px 4px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

.start-fill {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  background: var(--surface);
  color: var(--text);
  text-align: left;
}

.warmup {
  margin: 0 4px 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-2);
}

.warmup-toggle {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: none;
  background: none;
  color: var(--text);
  text-align: left;
}

.warmup-title {
  font-weight: 800;
  font-size: 0.86rem;
}

.warmup-sub {
  min-width: 0;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.warmup-chevron {
  margin-left: auto;
  color: var(--text-dim);
}

.warmup-list {
  list-style: none;
  margin: 0;
  padding: 0 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.warmup-line {
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.95rem;
  text-align: left;
}

.warmup-plates {
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent);
}

.warmup-foot {
  padding: 2px 4px 0;
  font-size: 0.72rem;
  color: var(--text-dim);
}

.lighter-offer {
  margin-top: 6px;
  padding: 8px;
  border-radius: 9px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.lighter-text {
  margin: 0 0 8px;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.lighter-text strong {
  color: var(--text);
}

.lighter-actions {
  display: flex;
  gap: 6px;
}

.lighter-take,
.lighter-skip {
  min-height: 44px;
  padding: 0 12px;
  border-radius: 9px;
  font-size: 0.82rem;
  font-weight: 700;
}

.lighter-take {
  flex: 1;
  min-width: 0;
  border: none;
  background: var(--accent);
  color: var(--accent-text);
}

.lighter-skip {
  flex-shrink: 0;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
}

.set-header-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px 8px;
}

/* Issue #492: the columns are fixed widths, so at a large Android font size
   the labels ran into each other. On narrow screens they stop growing past
   4.2vw (the normal size at 375px and wider) and a two-word weight label
   wraps. */
.set-header-row > span {
  font-size: min(0.95rem, 4.2vw);
  line-height: 1.15;
  white-space: nowrap;
  font-weight: 700;
  color: var(--text);
  text-align: center;
}

.set-header-number {
  width: 28px;
  flex-shrink: 0;
}

.set-header-weight {
  flex: 1;
  min-width: 0;
}

.set-header-row > .set-header-weight {
  white-space: normal;
  overflow-wrap: break-word;
}

.set-header-reps {
  width: 54px;
  flex-shrink: 0;
}

.set-header-time {
  width: 78px;
  flex-shrink: 0;
}

.set-header-rpe {
  width: 44px;
  flex-shrink: 0;
}

.set-header-spacer {
  width: 88px;
  flex-shrink: 0;
  margin-left: auto;
}

/* Backlog item 1: shared unit toggle drives every row's weight unit instead
   of repeating a full-width lb/kg <select> on every one. */
.unit-toggle {
  display: flex;
  gap: 4px;
}

.unit-btn {
  width: 52px;
  min-height: 40px;
  height: 40px;
  padding: 0;
  font-size: 1rem;
  font-weight: 700;
  background: var(--surface-2);
}

.unit-btn.unit-selected {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

/* Redesign item 67 follow-up: same crossing slide as .exercise-card-viewport
   above (reuses its .slide-next/.slide-prev transition classes, so both
   areas move in step with identical timing) -- position: relative makes
   this the positioning context for the outgoing/incoming panels, which both
   go absolute for the transition's duration (see handleSetRowsBeforeEnter/
   -Leave, which lock this element's own height for that same window --
   without it, having nothing left in normal flow would collapse it to zero
   height and snap the Finish button etc. up and back down). overflow
   (both axes, not just overflow-x) clips both the horizontal slide and any
   vertical difference between the two panels' natural heights. */
.set-rows-viewport {
  position: relative;
  overflow: hidden;
}

.set-rows-panel {
  box-sizing: border-box;
}

.set-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.set-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 68px;
  box-sizing: border-box;
  padding: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.set-row-logged {
  min-height: 56px;
  background: var(--surface);
}

.set-row-number {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text);
  font-size: 1rem;
  font-weight: 800;
}

.set-row-done {
  flex: 1;
  min-width: 0;
  padding-left: 6px;
  font-size: 1.2rem;
  font-weight: 700;
}

/* Issue #475: a logged set's small-win chip wraps to its own line, under
   the Weight column (past the set number), like the target chip above. */
.set-row-won {
  flex-wrap: wrap;
}

.set-win {
  flex-basis: 100%;
  display: flex;
  padding-left: 34px;
}

/* Logged reps-based sets: one value per column, same widths as the entry
   row's fields so each value sits under its header. */
.set-logged-cell {
  flex-shrink: 0;
  text-align: center;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text);
}

.set-logged-weight {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
}

.set-logged-unit {
  margin-left: 2px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-dim);
}

.set-logged-rpe {
  font-size: 1.1rem;
  color: var(--text-dim);
}

/* Item 103: pencil (44px tap target) + green check, together the same 88px
   as the entry row's ✕/✓ pair so the header spacer still lines up. */
.set-logged-actions {
  flex-shrink: 0;
  width: 88px;
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.edit-set-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  min-height: 0;
  padding: 0;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.set-logged-check {
  flex-shrink: 0;
  width: 40px;
  display: flex;
  justify-content: center;
  color: var(--success);
}

/* Item 103: a logged set being edited -- the draft row's inputs, plus a
   line below for Cancel/units or the delete confirm. */
.set-row-editing {
  border-color: var(--accent);
}

.set-row-editing:not(.set-row-stacked) {
  flex-wrap: wrap;
}

.set-edit-below {
  flex-basis: 100%;
  margin-top: 4px;
}

.set-edit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.set-edit-cancel {
  min-height: 44px;
  padding: 0 8px;
  font-size: 1rem;
  font-weight: 700;
}

/* The draft branch's vertical stack: the one-line row (or the stacked
   timed layout), then any error below it. */
.set-row-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.set-row-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.set-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  /* These are <label>s; the global label style's 12px top margin would
     knock each field out of line with its neighbors. */
  margin: 0;
}

.set-field-weight {
  flex: 1;
  min-width: 0;
}

.set-field-reps {
  width: 54px;
}

.set-field-time {
  width: 78px;
}

.set-field-rpe {
  width: 44px;
}

.set-input-compact {
  width: 100%;
  height: 52px;
  min-height: 52px;
  padding: 0 2px;
  background: var(--bg);
  border: 2px solid var(--accent);
  border-radius: 10px;
  color: var(--accent);
  text-align: center;
  font-size: 1.4rem;
  font-weight: 800;
  -moz-appearance: textfield;
}

.set-input-compact::-webkit-inner-spin-button,
.set-input-compact::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.set-input-compact::placeholder {
  color: color-mix(in srgb, var(--text-dim) 70%, transparent);
}

.set-input-rpe-compact {
  border: 2px dashed color-mix(in srgb, var(--text-dim) 70%, transparent);
  color: var(--text);
  font-size: 1.2rem;
}

/* Timed rows with 1+ tracked extras (Bike: Distance; Treadmill: Distance +
   Incline): the row stacks instead of squeezing onto one line. */
.set-row-stacked {
  flex-direction: column;
  align-items: stretch;
  padding: 12px;
}

.set-row-stacked .set-row-body {
  gap: 12px;
}

.set-row-stacked-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

.set-row-stacked-title {
  font-size: 1.1rem;
  font-weight: 800;
}

.remove-row-btn-text {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  margin: -6px -6px -6px 0;
  padding: 0 8px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 0.95rem;
  font-weight: 700;
}

/* One field per line in a single shared grid (label | input | unit), each
   field a subgrid spanning all three columns, so every label, every input's
   left edge, and the mi/km chip line up regardless of which extras the
   exercise tracks (item 101 follow-up). */
.set-grid-fields {
  display: grid;
  grid-template-columns: max-content max-content 1fr;
  align-items: center;
  gap: 10px 12px;
}

.set-grid-field {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: center;
  margin: 0;
}

.set-grid-fields .set-input-compact {
  width: 104px;
}

.set-field-inline-label {
  min-width: 76px;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
}

.set-field-optional {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
}

/* The Distance field's mi/km control: a single pill showing the active
   unit, tapped to flip it (item 97). */
.unit-chip {
  justify-self: start;
  min-width: 52px;
  min-height: 40px;
  height: 40px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--accent);
  border: none;
  color: var(--accent-text);
  font-size: 1rem;
  font-weight: 800;
}

.log-btn-wide {
  width: 100%;
  height: 52px;
  min-height: 52px;
  border-radius: 14px;
  background: var(--accent);
  border: none;
  color: var(--accent-text);
  font-size: 1.1rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.log-btn-wide:disabled {
  opacity: 0.4;
}

.set-row-actions-compact {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.log-btn-compact {
  flex-shrink: 0;
  width: 48px;
  height: 52px;
  min-height: 0;
  padding: 0;
  border-radius: 12px;
  background: var(--accent);
  border: none;
  color: var(--accent-text);
  display: flex;
  align-items: center;
  justify-content: center;
}

.log-btn-compact:disabled {
  opacity: 0.4;
}

.log-btn-compact-retry {
  background: var(--danger);
  color: var(--accent-text);
}

.stopwatch-btn {
  flex-shrink: 0;
  width: 40px;
  height: 52px;
  min-height: 0;
  padding: 0;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.set-grid-field .stopwatch-btn {
  justify-self: start;
}

.stopwatch-btn-spacer {
  flex-shrink: 0;
  width: 40px;
}

.remove-row-btn-compact {
  flex-shrink: 0;
  width: 36px;
  height: 52px;
  min-height: 0;
  padding: 0;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-row-btn {
  width: 100%;
  min-height: 48px;
  margin-top: 8px;
  background: transparent;
  border: 2px dashed var(--border);
  color: var(--text-dim);
  font-size: 1rem;
  font-weight: 700;
}

/* Narrow phones (360px and under): trim the fixed columns so the flexible
   weight field keeps enough room for a value like "132.5". */
@media (max-width: 360px) {
  .set-field-reps,
  .set-header-reps {
    width: 48px;
  }

  .set-field-rpe,
  .set-header-rpe {
    width: 40px;
  }

  /* Issue #85's Start timer button joined the Plank row; these give back
     the room it takes. */
  .set-field-time,
  .set-header-time {
    width: 70px;
  }

  .stopwatch-btn,
  .stopwatch-btn-spacer {
    width: 34px;
  }

  .set-input-compact {
    font-size: 1.25rem;
  }
}

/* 340px and under: small phones, but also any phone with Android's
   Display size turned up -- exactly the users this larger layout is for.
   Tighten every fixed column so the weight field keeps ~60px. */
@media (max-width: 340px) {
  .set-row,
  .set-row-line,
  .set-header-row {
    gap: 4px;
  }

  .set-row-number,
  .set-header-number {
    width: 22px;
  }

  .set-field-reps,
  .set-header-reps {
    width: 44px;
  }

  .set-field-rpe,
  .set-header-rpe {
    width: 36px;
  }

  .set-header-spacer,
  .set-logged-actions {
    width: 72px;
  }

  .set-logged-check {
    width: 24px;
  }

  .remove-row-btn-compact {
    width: 28px;
  }


  .log-btn-compact {
    width: 40px;
  }

  .set-input-compact,
  .set-logged-cell {
    font-size: 1.15rem;
  }

  .set-header-row > span {
    font-size: min(0.85rem, 4.25vw);
  }

  .set-grid-fields {
    column-gap: 8px;
  }

  .set-grid-fields .set-input-compact {
    width: 88px;
  }
}

.row-error {
  color: var(--danger);
  font-size: 0.8rem;
  margin: 0;
}

</style>
