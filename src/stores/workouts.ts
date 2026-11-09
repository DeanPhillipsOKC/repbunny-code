import { ref } from 'vue'
import { defineStore } from 'pinia'
import { repos, type SetFields } from '../data'
import { useBodyWeightStore } from './bodyWeight'
import { useExercisesStore } from './exercises'
import { useProfileStore } from './profile'
import { useTemplatesStore } from './templates'
import { beatsBest, computeEffectiveLoad, findRecentPr, ZERO_MARKER, type RecentPr, type SetMarker } from '../lib/progress'
import { buildFinishRecap, type FinishRecap, type PriorSet, type RecapSessionSet, type RecapWorkoutSummary } from '../lib/finishRecap'
import type { BodyWeightEntryLike } from '../lib/bodyStats'
import type { ExerciseHistoryWorkout } from '../lib/exerciseHistory'
import { startOfWeek as weekStart, type ProgressSetRow } from '../lib/progressHub'
import {
  addSeenTiers,
  clearIntro,
  importedTierIds,
  initSeenTiers,
  milestoneCounts,
  newlyReached,
  nextUnlock,
  nextUnlockText,
  pendingIntro,
  readSeenTiers,
  type FinishMilestones,
} from '../lib/milestones'
import type { DistanceUnit, LoadType, SetEntry, SetWithExercise, WeightUnit, WorkoutWithSets } from '../lib/types'
import { claimChartTeaser, dismissChartTeaser, isPremium, showPremiumNudges } from '../lib/premium'
import { earnTrialPasses } from '../lib/trialPass'
import type { FeelWorkoutRow, WorkoutFeel } from '../lib/workoutFeel'
import { parseWorkoutEvents, type WorkoutEvent } from '../lib/workoutEvents'
import { saveCopiesAfterFinish } from '../lib/backupFolder'
import { cleanExerciseNote, exerciseNotesById } from '../lib/exerciseNotes'
import { findSmallWins, type SmallWin, type WinSet, type WinTarget } from '../lib/smallWins'

// Backlog item 78: shared by checkForRecord/getBestMarker/fetchProgressStats/
// fetchTemplateVolumeHistory below, all of which need body weight entries to
// compute a bodyweight set's effective load but don't otherwise depend on
// stores/bodyWeight.ts's own fetch lifecycle (BodyScreen.vue is the only
// other place that calls fetchEntries). `fetched` (not `entries.length`)
// distinguishes "already fetched, genuinely zero entries" from "never
// fetched yet" — see bodyWeight.ts.
async function ensureBodyWeightEntries(): Promise<BodyWeightEntryLike[]> {
  const bodyWeight = useBodyWeightStore()
  if (!bodyWeight.fetched) await bodyWeight.fetchEntries()
  return bodyWeight.entries
}

// Load type can't change once an exercise has sets, so the exercises store
// (archived ones included) is the source for any set's.
function milestoneLoadTypes(): (exerciseId: string) => LoadType {
  const byId = new Map(useExercisesStore().exercises.map((e) => [e.id, e.load_type]))
  return (id) => byId.get(id) ?? 'weight'
}

// Recover-interrupted-workout item: the only local trace of "which workout
// row is the active one," so a reload/relaunch can look it back up instead
// of losing the session. Holds just the id — never trusted on its own, always
// re-fetched before anything is restored from it (see
// checkForRecoverableWorkout).
const ACTIVE_WORKOUT_STORAGE_KEY = 'repbunny-active-workout-id'

function persistActiveWorkoutId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_WORKOUT_STORAGE_KEY, id)
  else localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY)
}

// The set columns addSet/updateSet and their History twins all write.
function setFields(
  reps: number | null,
  weight: number,
  weightUnit: WeightUnit,
  rpe: number | null,
  level: number | null,
  durationSeconds: number | null,
  distance: number | null,
  distanceUnit: DistanceUnit | null,
  incline: number | null,
  calories: number | null,
): SetFields {
  return {
    reps,
    weight,
    weight_unit: weightUnit,
    rpe,
    level,
    duration_seconds: durationSeconds,
    distance,
    distance_unit: distanceUnit,
    incline,
    calories,
  }
}

// Core logging flow per docs/architecture.md build order step 4:
// create workout -> add sets to it -> view history.
export const useWorkoutsStore = defineStore('workouts', () => {
  const history = ref<WorkoutWithSets[]>([])
  const loading = ref(false)
  const errorMessage = ref('')

  const activeWorkoutId = ref<string | null>(null)
  const activeTemplateId = ref<string | null>(null)
  // Backlog item 50: client-side-only start time for the in-session elapsed
  // timer. Not persisted — a refresh loses it, same as activeWorkoutId
  // itself, until the `finished_at`/session-persistence migration this
  // item explicitly scopes out lands (see docs/backlog.md item 50).
  const activeWorkoutStartedAt = ref<number | null>(null)
  const activeSets = ref<SetEntry[]>([])
  // In-session carousel state survives Home unmounting during tab navigation.
  const activeExerciseId = ref('')
  const adHocExerciseIds = ref<string[]>([])
  // Issue #536: "Do this again" opens a freeform workout with one open row per
  // set the last workout logged, keyed by exercise id. Empty for every other start.
  const repeatSetCounts = ref<Record<string, number>>({})
  // Issue #150: template exercises swapped out for this workout only, keyed
  // by the template's exercise id. `targetSets` is what was left of the
  // planned count when it was swapped. Never written to the template.
  const swappedExercises = ref<Record<string, { to: string; targetSets: number | null }>>({})
  // Issue #156: every exercise swapped in this workout, to the template
  // exercise it replaced. Unlike swappedExercises, a later swap doesn't drop
  // an earlier one, so a swap that got sets keeps its recap label.
  const swapOrigins = ref<Record<string, string>>({})
  // Issue #150: a swapped-in exercise rests like the one it replaced, for
  // this workout only. Swapped-in id -> the exercise whose rest_seconds apply.
  const swapRestSource = ref<Record<string, string>>({})
  const previousWorkout = ref<WorkoutWithSets | null>(null)

  // Recover-interrupted-workout item: populated by checkForRecoverableWorkout
  // when a persisted active-workout reference resolves to a real, still-owned
  // row on boot. Kept separate from activeWorkoutId so the logger can offer
  // an explicit Resume/Discard choice instead of silently dropping the user
  // back into an in-progress session.
  const recoverableWorkout = ref<WorkoutWithSets | null>(null)

  // Resume-after-finish item: the workout finishWorkout() most recently
  // completed with at least one set, offered back as an undo for an
  // accidental "Finish workout" tap. Deliberately NOT persisted like
  // ACTIVE_WORKOUT_STORAGE_KEY above — this is a short-lived, same-session
  // undo window, not crash recovery, so a reload silently drops the offer
  // rather than resurrecting it indefinitely. justFinishedWorkoutId is set
  // synchronously by finishWorkout; justFinishedWorkout is the fresh,
  // server-fetched copy (same shape/query as checkForRecoverableWorkout)
  // that fetchJustFinishedWorkout populates before the UI offers to resume,
  // so resumeJustFinishedWorkout restores from real server state rather than
  // a possibly-stale in-memory snapshot.
  const justFinishedWorkoutId = ref<string | null>(null)
  const justFinishedWorkout = ref<WorkoutWithSets | null>(null)

  // Backlog item 106: post-finish session recap for the workout just
  // finished. Populated by fetchFinishRecap, cleared by clearFinishRecap once
  // the recap has been dismissed (or the workout resumed).
  const finishRecap = ref<FinishRecap | null>(null)

  // Issue #153: milestone tiers the finished workout crossed, plus the
  // one-time note for history that predates milestones. Set together with
  // finishRecap so the recap never changes shape after it shows. Marked seen
  // on Done (commitFinishMilestones), so a resume-and-refinish shows them again.
  // Issue #188: or, when it crossed nothing, the next-unlock line.
  const finishMilestones = ref<FinishMilestones | null>(null)
  // Issue #187: the unlock screen (UnlockCelebration.vue) shows once per
  // finish; kept here so leaving Home and coming back doesn't replay it.
  const finishUnlockShown = ref(false)

  // Issue #156: the finished workout's swapOrigins, kept from finishWorkout
  // so the recap can label them. Only the recap right after finishing shows
  // these labels; the saved story (#158, workouts.events) is what lasts.
  const finishSwaps = ref<Record<string, string>>({})

  // Backlog item 11: addSet's insert can still be in flight when the user
  // (or a fast test script) moves straight on to finishing/starting a
  // workout. Anything that reads or depends on "this workout's sets are
  // fully committed" — fetchPreviousWorkout's query, finishWorkout's
  // empty-workout delete — awaits this first so it can't run ahead of a
  // write it was racing.
  const pendingWrites = new Set<PromiseLike<unknown>>()

  async function waitForPendingWrites() {
    if (pendingWrites.size > 0) await Promise.all(pendingWrites)
  }

  // Backlog item 4 (screen: item 38): set by the (unawaited) record check
  // kicked off from addSet below. A plain ref rather than addSet's return
  // value so the record check can run in the background without slowing
  // down the add — the UI reacts to this changing instead of waiting on it.
  // Carries the full set (not just volume) so the celebration screen can
  // show what was actually lifted and how it compares to the prior best.
  const newRecord = ref<{
    exerciseId: string
    reps: number
    weight: number
    weightUnit: WeightUnit
    level: number | null
    loadType: LoadType
    effectiveLoad: number | null
    previousBest: SetMarker
    firstEver: boolean
  } | null>(null)

  // Issue #161: how many addSet calls haven't yet settled whether they set a
  // record (counted from the call itself, so it's never 0 between a tap and
  // the background check starting). WorkoutLogger.vue shows it as
  // `data-record-check`, so e2e/fixtures/celebration.ts can wait for the
  // answer instead of a fixed 2s guess on every uncelebrated set.
  const recordChecksPending = ref(0)

  // Issue #475: small wins (lib/smallWins.ts) per logged set id, set by the
  // same background check as newRecord. Session-local: a reloaded workout's
  // sets and past workouts in History don't show them. The logger notes the
  // target a row showed (noteSetTarget) before saving it.
  const smallWinsBySetId = ref<Record<string, SmallWin[]>>({})
  const setTargets = new Map<string, WinTarget>()
  function noteSetTarget(setId: string, target: WinTarget | null) {
    if (target) setTargets.set(setId, target)
    else setTargets.delete(setId)
  }
  // Issue #476: the latest set with small wins and no new record, for the
  // logger's "All wins" celebration (lib/recordCelebrations.ts).
  const newSmallWin = ref<{
    exerciseId: string
    setId: string
    reps: number
    weight: number
    weightUnit: WeightUnit
    level: number | null
    loadType: LoadType
    wins: SmallWin[]
  } | null>(null)
  function dropSmallWin(setId: string) {
    if (!(setId in smallWinsBySetId.value)) return
    const next = { ...smallWinsBySetId.value }
    delete next[setId]
    smallWinsBySetId.value = next
  }

  // Backlog item 3: most recent past workout logged against this template
  // that actually has sets on it, so the logger can show what to beat.
  // `sets!inner` turns the embed into an inner join so workouts with zero
  // sets (e.g. started and finished without logging anything) are excluded
  // rather than winning on recency and showing an empty card. Called before
  // startWorkout so the just-created row can't show up as its own "previous"
  // workout.
  // excludeWorkoutId matters for resumeRecoverableWorkout below: the workout
  // being resumed already exists in `workouts` by the time this runs, so
  // without excluding it the "most recent workout for this template" query
  // would just find itself and show the resumed session as its own "last
  // time" card.
  async function fetchPreviousWorkout(templateId: string, excludeWorkoutId: string | null = null) {
    await waitForPendingWrites()

    const { data, error } = await repos.workouts.getPreviousForTemplate(templateId, excludeWorkoutId)

    if (!error) {
      previousWorkout.value = data
    }
    return { error }
  }

  // Backlog item 88: when the same-template previous workout has nothing for
  // an exercise (a freeform session, a template's first run, or an exercise
  // shared between two templates), fall back to that exercise's own most
  // recent workout, any template or freeform, so the logger can still answer
  // "what did I do last time on this lift?" Keyed by exercise id and cached
  // for the rest of the session (WorkoutLogger.vue's ensureDraftRows only
  // ever calls this once per exercise, but a re-selected exercise re-reads
  // the same cache entry instead of re-querying). Same `sets!inner` /
  // `.eq('sets.<col>', ...)` shape as fetchExerciseHistory above, which
  // filters the nested array itself, not just which parent workout matches.
  const fallbackPreviousSetsByExercise = ref<Record<string, SetWithExercise[]>>({})

  async function fetchFallbackPreviousSets(exerciseId: string): Promise<SetWithExercise[]> {
    const cached = fallbackPreviousSetsByExercise.value[exerciseId]
    if (cached) return cached

    const { data, error } = await repos.workouts.getLatestSetsForExercise(exerciseId, activeWorkoutId.value)
    // A failed lookup leaves rows blank rather than blocking logging — cached
    // as "nothing found" so a flaky request isn't retried on every re-select.
    const sets = !error ? data : []
    fallbackPreviousSetsByExercise.value = { ...fallbackPreviousSetsByExercise.value, [exerciseId]: sets }
    return sets
  }

  // Issue #535: each exercise's note for the active workout ("Note for
  // today"), by exercise id.
  const activeExerciseNotes = ref<Record<string, string>>({})

  // Issue #535: the note from each exercise's last session (the workout the
  // fallback sets above come from), shown under "Last time" in the logger.
  // Cached and cleared with those sets.
  const lastExerciseNotes = ref<Record<string, string | null>>({})

  async function fetchLastExerciseNote(exerciseId: string): Promise<string | null> {
    if (exerciseId in lastExerciseNotes.value) return lastExerciseNotes.value[exerciseId]
    const { data, error } = await repos.workouts.getLastExerciseNote(exerciseId, activeWorkoutId.value)
    const note = !error ? data : null
    lastExerciseNotes.value = { ...lastExerciseNotes.value, [exerciseId]: note }
    return note
  }

  // Issue #535: saves (or, when blank, clears) an exercise's note for the
  // active workout. Tracked as a pending write so finishing right after
  // can't race it.
  async function saveExerciseNote(exerciseId: string, text: string | null) {
    const workoutId = activeWorkoutId.value
    if (!workoutId) return { error: null }
    const note = cleanExerciseNote(text)
    const write = repos.workouts.setExerciseNote(workoutId, exerciseId, note)
    pendingWrites.add(write)
    let result: Awaited<typeof write>
    try {
      result = await write
    } finally {
      pendingWrites.delete(write)
    }
    if (!result.error) {
      const next = { ...activeExerciseNotes.value }
      if (note) next[exerciseId] = note
      else delete next[exerciseId]
      activeExerciseNotes.value = next
      const entry = history.value.find((w) => w.id === workoutId)
      if (entry) entry.exercise_notes = Object.entries(next).map(([id, n]) => ({ exercise_id: id, note: n }))
    }
    return result
  }

  // Issue #140: an exercise's history before this workout, for the logger's
  // Premium target. Cached per workout like the fallback above, so the
  // target holds still while this session's sets go in.
  const targetHistoryByExercise = ref<Record<string, ExerciseHistoryWorkout[]>>({})

  async function fetchTargetHistory(exerciseId: string): Promise<ExerciseHistoryWorkout[]> {
    const cached = targetHistoryByExercise.value[exerciseId]
    if (cached) return cached
    const activeId = activeWorkoutId.value
    const { data, error } = await repos.workouts.listExerciseHistory(exerciseId)
    const history = !error ? data.filter((w) => w.workoutId !== activeId) : []
    targetHistoryByExercise.value = { ...targetHistoryByExercise.value, [exerciseId]: history }
    return history
  }

  // Backlog item 106: everything the post-finish recap needs beyond the
  // finished workout itself -- every earlier set of its exercises (records,
  // vs last time), the template's last few sessions (volume bars), and this
  // week's workouts (week strip) -- fetched in parallel, then handed to
  // buildFinishRecap. `finished` is justFinishedWorkout, already fetched by
  // the time this runs. A failed query leaves the recap null, and the logger
  // falls back to the plain "Resume your workout?" card.
  async function fetchFinishRecap(finished: WorkoutWithSets, finishedAt: Date) {
    const exerciseIds = [...new Set(finished.sets.map((s) => s.exercise_id))]

    const startOfWeek = weekStart(finishedAt)

    // Prior sets are paged past PostgREST's 1000-row cap, so records are
    // judged against a long-lived exercise's full history, not part of it.
    const [prior, templateResult, weekResult, bodyWeightEntries, milestones, totals] = await Promise.all([
      exerciseIds.length > 0
        ? repos.workouts.listPriorSets(exerciseIds, finished.id)
        : Promise.resolve({ data: [] as PriorSet[], error: null }),
      finished.template_id
        ? repos.workouts.listTemplateSessions(finished.template_id, finished.performed_at, 6)
        : Promise.resolve({ data: [] as RecapWorkoutSummary[], error: null }),
      repos.workouts.listWorkoutSummariesSince(startOfWeek.toISOString()),
      ensureBodyWeightEntries(),
      findFinishMilestones(finished.id),
      repos.backup.countWorkoutsAndSets().catch(() => null),
    ])
    finishMilestones.value = milestones
    finishUnlockShown.value = false
    if (prior.error || templateResult.error || weekResult.error) {
      finishRecap.value = null
      return
    }

    finishRecap.value = buildFinishRecap({
      workout: {
        id: finished.id,
        performed_at: finished.performed_at,
        templateName: finished.template_id ? (finished.workout_templates?.name ?? null) : null,
        sets: finished.sets as unknown as RecapSessionSet[],
      },
      finishedAt,
      priorSets: prior.data,
      templateSessions: [...templateResult.data].reverse(),
      weekWorkouts: weekResult.data,
      weekWorkoutCount: weekResult.count ?? weekResult.data.length,
      hasEarlierWorkouts: totals !== null && totals.workouts > 1,
      bodyWeightEntries,
      preferredUnit: useProfileStore().weightUnit,
    })
    claimChartTeaser(finishRecap.value.chartTeaser)
  }

  function clearFinishRecap() {
    dismissChartTeaser()
    finishRecap.value = null
    finishMilestones.value = null
    finishSwaps.value = {}
  }

  // Issue #153. Never blocks the recap: a failed read just shows no
  // milestones this time, and the next finish catches up.
  async function findFinishMilestones(finishedId: string): Promise<FinishMilestones | null> {
    const [{ data, error }, bodyWeightEntries] = await Promise.all([repos.workouts.listProgressSets(), ensureBodyWeightEntries()])
    if (error) return null
    const loadTypeOf = milestoneLoadTypes()
    let seen = readSeenTiers()
    if (!seen) {
      // First finish on this device since milestones shipped: what the
      // history before this workout reached is already unlocked.
      const before = data.filter((s) => s.workout_id !== finishedId)
      seen = initSeenTiers(milestoneCounts(before, loadTypeOf, bodyWeightEntries), isPremium.value, importedTierIds(before, loadTypeOf, bodyWeightEntries))
    }
    const counts = milestoneCounts(data, loadTypeOf, bodyWeightEntries)
    // Tiers an import crossed (#462) never celebrate or reward.
    const tiers = newlyReached(counts, seen, importedTierIds(data, loadTypeOf, bodyWeightEntries))
    // Issue #155: a free user's trial passes are theirs from the finish, so
    // the recap can offer to start one. A tier grants once (a refinish adds
    // nothing), and one reached with Premium never grants.
    if (showPremiumNudges.value) earnTrialPasses(tiers.map((t) => t.id))
    const intro = pendingIntro()
    if (tiers.length > 0 || intro) return { tiers, intro, next: null }
    // Issue #188: nothing crossed, so say what's close: the next Extra for
    // Premium, the next trial pass for free users (#190).
    const next = nextUnlock(counts, seen, isPremium.value)
    return next ? { tiers, intro, next: nextUnlockText(next) } : null
  }

  function commitFinishMilestones() {
    const milestones = finishMilestones.value
    if (!milestones) return
    addSeenTiers(milestones.tiers.map((t) => t.id))
    if (milestones.intro) clearIntro()
  }

  // Backlog item 19: Log home screen's progress strip. Recomputed on every
  // load rather than persisted — cheap, no migration, but only ever shows
  // "since your last workout" (see docs/backlog.md#19 for the tradeoff).
  const workoutsThisWeek = ref(0)
  const recentPr = ref<RecentPr | null>(null)

  // Backlog item 44: paw-print week tracker on the Home screen replaces the
  // bare count with one dot per day Sun..Sat, filled for a day that has at
  // least one workout. Index 0 = Sunday, matching getDay() and startOfWeek's
  // Sunday-based week (progressHub.ts).
  const workoutDaysThisWeek = ref<boolean[]>([false, false, false, false, false, false, false])

  async function fetchProgressStats() {

    const startOfWeek = weekStart()

    // The week read is paged past PostgREST's default max-rows (1000), which
    // silently froze this tile once the (test) account crossed that many
    // workouts in a week (docs/backlog-archive.md item 56, issue #103).
    const [{ data: weekWorkouts, count: weekCount }, { data: recentWorkout }] = await Promise.all([
      repos.workouts.listWorkoutDatesSince(startOfWeek.toISOString()),
      repos.workouts.getLatestWorkoutSets(),
    ])
    workoutsThisWeek.value = weekCount ?? 0

    const days = [false, false, false, false, false, false, false]
    for (const w of weekWorkouts ?? []) {
      days[new Date(w.performed_at).getDay()] = true
    }
    workoutDaysThisWeek.value = days

    if (!recentWorkout || recentWorkout.sets.length === 0) {
      recentPr.value = null
      return
    }

    // Backlog item 93: timed sets have no reps to compare and never produce a
    // PR (see acceptSavedSet's own guard) -- excluded before anything below
    // even looks at reps, which is null for them.
    const prEligibleSets = recentWorkout.sets.filter((s) => (s.exercises?.load_type ?? 'weight') !== 'timed')
    if (prEligibleSets.length === 0) {
      recentPr.value = null
      return
    }

    const exerciseIds = [...new Set(prEligibleSets.map((s) => s.exercise_id))]
    const { data: historicalSets } = await repos.workouts.listSetMarkersForExercises(exerciseIds, recentWorkout.id)


    // Historical sets aren't fetched with their exercise embedded (the query
    // above only needs exercise_id to group by) — load type can't change
    // once an exercise has logged sets, so this workout's own sets for the
    // same exercise are a reliable stand-in.
    const loadTypeByExerciseId = new Map(prEligibleSets.map((s) => [s.exercise_id, s.exercises?.load_type ?? 'weight']))

    // Backlog items 78/79: only worth the round trip when a bodyweight or
    // assisted set is actually in play — most PR checks are 'weight'/'level'
    // and never touch this.
    const usesBodyWeight = (t: LoadType | undefined) => t === 'bodyweight' || t === 'assisted'
    const needsBodyWeight =
      prEligibleSets.some((s) => usesBodyWeight(s.exercises?.load_type)) ||
      [...loadTypeByExerciseId.values()].some(usesBodyWeight)
    const bodyWeightEntries = needsBodyWeight ? await ensureBodyWeightEntries() : []

    recentPr.value = findRecentPr(
      prEligibleSets.map((s) => ({
        exerciseId: s.exercise_id,
        exerciseName: s.exercises?.name ?? 'Unknown',
        reps: s.reps ?? 0,
        weight: s.weight,
        weightUnit: s.weight_unit,
        loadType: s.exercises?.load_type ?? 'weight',
        level: s.level,
        performedAt: recentWorkout.performed_at,
      })),
      historicalSets
        .filter((s) => loadTypeByExerciseId.get(s.exercise_id) !== 'timed')
        .map((s) => ({
          exerciseId: s.exercise_id,
          reps: s.reps,
          weight: s.weight,
          weightUnit: s.weight_unit,
          loadType: loadTypeByExerciseId.get(s.exercise_id) ?? 'weight',
          level: s.level,
          performedAt: s.workouts?.performed_at ?? recentWorkout.performed_at,
        })),
      bodyWeightEntries,
    )
  }

  async function startWorkout(notes: string | null = null, templateId: string | null = null) {
    await waitForPendingWrites()

    const { data, error } = await repos.workouts.createWorkout(notes, templateId)

    if (!error && data) {
      activeWorkoutId.value = data.id
      activeTemplateId.value = templateId
      activeWorkoutStartedAt.value = Date.now()
      activeSets.value = []
      activeExerciseNotes.value = {}
      activeExerciseId.value = ''
      adHocExerciseIds.value = []
      repeatSetCounts.value = {}
      swappedExercises.value = {}
      swapOrigins.value = {}
      swapRestSource.value = {}
      persistActiveWorkoutId(data.id)
      // Resume-after-finish item: the window only ever covers the single
      // most-recently-finished workout, so starting any new one closes it.
      justFinishedWorkoutId.value = null
      justFinishedWorkout.value = null
    }
    return { data, error }
  }

  // Recover-interrupted-workout item: reads the persisted active-workout
  // reference (if any) and re-fetches it through the normal signed-in
  // client — RLS is what actually enforces "or belongs to another account"
  // from the item's requirements, so a row that isn't (or is no longer)
  // this user's just comes back empty, same as one that was deleted.
  // Guarded on activeWorkoutId so it's a no-op once a workout is already
  // active in this session (e.g. re-running after sign-in with one already
  // started).
  async function checkForRecoverableWorkout() {
    const id = localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY)
    if (!id || activeWorkoutId.value) return

    const { data, error } = await repos.workouts.getWorkout(id)

    if (error || !data) {
      persistActiveWorkoutId(null)
      return
    }
    recoverableWorkout.value = data
  }

  // Restores the template, start time, and server-ordered sets exactly as
  // fetched by checkForRecoverableWorkout — never trusts any other cached
  // set list. Doesn't touch `notes`/template-exercise state; the caller
  // (WorkoutLogger.vue) reads recoverableWorkout for those before calling
  // this, same as it already does for a freshly started workout.
  function resumeRecoverableWorkout() {
    const recovered = recoverableWorkout.value
    if (!recovered) return
    activeWorkoutId.value = recovered.id
    activeTemplateId.value = recovered.template_id
    activeWorkoutStartedAt.value = new Date(recovered.performed_at).getTime()
    activeSets.value = recovered.sets
    activeExerciseNotes.value = exerciseNotesById(recovered.exercise_notes)
    activeExerciseId.value = ''
    adHocExerciseIds.value = []
    swappedExercises.value = {}
    swapOrigins.value = {}
    swapRestSource.value = {}
    recoverableWorkout.value = null
    persistActiveWorkoutId(recovered.id)
  }

  // Only ever called after the user explicitly confirms discarding a
  // recovered workout (WorkoutLogger.vue) — including one with saved sets,
  // per the item's "never silently deleted" requirement. `sets.workout_id`
  // cascades (src/data/sqlite/schema.ts), same as deleteWorkout below.
  async function discardRecoverableWorkout() {
    const recovered = recoverableWorkout.value
    if (!recovered) return { error: null }
    const { error } = await repos.workouts.deleteWorkout(recovered.id)
    if (!error) {
      progressSetsStale.value = true
      recoverableWorkout.value = null
      persistActiveWorkoutId(null)
    }
    return { error }
  }

  // Clears the active-workout state, its persisted reference, and every read
  // cache this store holds, so a reset or an erase (refetchAccountData) starts
  // from nothing instead of showing what was in memory from before. Pinia
  // stores are app-lifetime singletons in this SPA (item 84).
  function resetActiveWorkoutState() {
    activeWorkoutId.value = null
    activeTemplateId.value = null
    activeWorkoutStartedAt.value = null
    activeSets.value = []
    activeExerciseNotes.value = {}
    activeExerciseId.value = ''
    adHocExerciseIds.value = []
    swappedExercises.value = {}
    swapOrigins.value = {}
    swapRestSource.value = {}
    previousWorkout.value = null
    newRecord.value = null
    newSmallWin.value = null
    smallWinsBySetId.value = {}
    setTargets.clear()
    recoverableWorkout.value = null
    justFinishedWorkoutId.value = null
    justFinishedWorkout.value = null
    persistActiveWorkoutId(null)

    history.value = []
    workoutsThisWeek.value = 0
    workoutDaysThisWeek.value = [false, false, false, false, false, false, false]
    recentPr.value = null
    exerciseHistory.value = []
    exerciseHistoryError.value = ''
    finishRecap.value = null
    recentlyLoggedExerciseIds.value = []
    progressSets.value = []
    progressSetsFetched.value = false
    progressSetsStale.value = true
    feelRows.value = []
    feelRowsFetched.value = false
    workoutEvents.value = {}
    workoutEventsFetched.value = false
    workoutNotes.value = {}
    workoutNotesFetched.value = false
    bestMarkerCache.clear()
    fallbackPreviousSetsByExercise.value = {}
    lastExerciseNotes.value = {}
    targetHistoryByExercise.value = {}
  }

  // Backlog item 4: per-user, per-exercise all-time best set, across every
  // past set for that exercise regardless of workout/template. Session-local
  // cache: once an exercise's history has been read, later sets for it are
  // compared in memory and only update the cache, never re-reading the DB.
  // This keeps addSet's own critical path (below) free of any lookup — the
  // record check runs after the insert, in the background, so it never
  // delays the add itself.
  // Backlog item 76: "best" used to mean the highest reps*weight volume, but
  // a level exercise's weight is always 0 (see SetEntry.level) so that rule
  // would never register a level PR. `level !== null` on the candidate set
  // is enough to tell which comparison applies — an exercise's load type
  // can't change once it has logged sets, so a level exercise's sets are
  // always level, never a mix.
  // Issue #475: `sets` is every earlier set of the exercise, for the small
  // wins check, kept up to date the same way.
  const bestMarkerCache = new Map<string, { marker: SetMarker; hasHistory: boolean; sets: WinSet[] }>()

  // excludeSetId matters only on a cache miss — this runs after the insert
  // (see checkForRecord), so a first-ever read of this exercise's history
  // would otherwise see the just-inserted row and compare it against itself.
  // Backlog item 78: `loadType` is passed in by the caller (an exercise's
  // load type can't change once it has logged sets — see docs/backlog.md
  // item 76 — so it's authoritative for every one of its past rows) rather
  // than re-derived from `level`, which can't tell 'weight' and 'bodyweight'
  // apart (both always null).
  async function getBestMarker(exerciseId: string, excludeSetId: string, loadType: LoadType) {
    const cached = bestMarkerCache.get(exerciseId)
    if (cached !== undefined) return cached

    const { data, error } = await repos.workouts.listSetMarkersForExercise(exerciseId, excludeSetId)
    let best: SetMarker = ZERO_MARKER
    if (!error && data) {
      const bodyWeightEntries = loadType === 'bodyweight' || loadType === 'assisted' ? await ensureBodyWeightEntries() : []
      for (const s of data) {
        const effectiveLoad = s.workouts
          ? computeEffectiveLoad(loadType, s.weight, s.weight_unit, s.workouts.performed_at, bodyWeightEntries)
          : null
        const marker: SetMarker = { loadType, level: s.level, reps: s.reps, weight: s.weight, weightUnit: s.weight_unit, effectiveLoad, performedAt: s.workouts?.performed_at }
        if (beatsBest(marker, best)) best = marker
      }
    }
    const sets: WinSet[] = (data ?? []).map((s) => ({ reps: s.reps, weight: s.weight, weight_unit: s.weight_unit, level: s.level }))
    const result = { marker: best, hasHistory: sets.length > 0, sets }
    bestMarkerCache.set(exerciseId, result)
    return result
  }

  async function checkForRecord(
    exerciseId: string,
    setId: string,
    reps: number,
    weight: number,
    weightUnit: WeightUnit,
    level: number | null,
    loadType: LoadType,
    performedAt: string,
  ) {
    recordChecksPending.value++
    try {
      const { marker: previousBest, hasHistory, sets: priorSets } = await getBestMarker(exerciseId, setId, loadType)
      const bodyWeightEntries = loadType === 'bodyweight' || loadType === 'assisted' ? await ensureBodyWeightEntries() : []
      const effectiveLoad = computeEffectiveLoad(loadType, weight, weightUnit, performedAt, bodyWeightEntries)
      const candidate: SetMarker = { loadType, level, reps, weight, weightUnit, effectiveLoad, performedAt }
      const winSet: WinSet = { reps, weight, weight_unit: weightUnit, level }
      const wins = findSmallWins(winSet, loadType, priorSets, setTargets.get(setId) ?? null)
      setTargets.delete(setId)
      if (wins.length > 0) smallWinsBySetId.value = { ...smallWinsBySetId.value, [setId]: wins }
      const sets = [...priorSets, winSet]
      if (!hasHistory || beatsBest(candidate, previousBest)) {
        bestMarkerCache.set(exerciseId, { marker: candidate, hasHistory: true, sets })
        newRecord.value = { exerciseId, reps, weight, weightUnit, level, loadType, effectiveLoad, previousBest, firstEver: !hasHistory }
      } else {
        bestMarkerCache.set(exerciseId, { marker: previousBest, hasHistory, sets })
        if (wins.length > 0) newSmallWin.value = { exerciseId, setId, reps, weight, weightUnit, level, loadType, wins }
      }
    } finally {
      recordChecksPending.value--
    }
  }

  // Issue #161: holds one recordChecksPending count until the save itself
  // settles; a saved set's checkForRecord takes its own count before this
  // one is released, so the total never dips to 0 in between.
  async function addSet(...args: Parameters<typeof saveSet>) {
    recordChecksPending.value++
    try {
      return await saveSet(...args)
    } finally {
      recordChecksPending.value--
    }
  }

  async function saveSet(
    exerciseId: string,
    reps: number | null,
    weight: number,
    weightUnit: WeightUnit,
    rpe: number | null,
    level: number | null = null,
    durationSeconds: number | null = null,
    distance: number | null = null,
    distanceUnit: DistanceUnit | null = null,
    incline: number | null = null,
    calories: number | null = null,
    setId: string = crypto.randomUUID(),
    retry = false
  ) {
    // Captured before the await below — finishWorkout() can clear
    // activeWorkoutId.value/activeSets.value while this call is in flight,
    // and the insert must still target the workout it started with.
    const workoutId = activeWorkoutId.value
    if (!workoutId) return { error: new Error('No active workout') }

    // A failed response does not prove the insert failed. On retry, read by
    // the same client ID before writing again. If the read itself fails, keep
    // the row uncertain rather than risking a second set.
    const findSavedSet = async () => {
      try {
        return await repos.workouts.findSet(setId, workoutId)
      } catch (cause) {
        return { data: null, error: cause instanceof Error ? cause : new Error(String(cause)) }
      }
    }

    function acceptSavedSet(data: SetEntry) {
      if (activeWorkoutId.value === workoutId && !activeSets.value.some((set) => set.id === data.id)) {
        activeSets.value.push(data)
      }
      // Backlog item 78: checkForRecord needs the exercise's load type
      // (SetEntry itself doesn't carry it) and roughly when the set was
      // logged, to look up body weight for a bodyweight set's effective
      // load — activeWorkoutStartedAt is set the moment this workout's row
      // was inserted, close enough to its DB-side `performed_at` default.
      const loadType = useExercisesStore().exercises.find((e) => e.id === data.exercise_id)?.load_type ?? 'weight'
      // Backlog item 93: no record celebration for timed sets in v1 (they
      // have no reps to compare against a prior best anyway).
      if (loadType === 'timed') return
      const performedAt = new Date(activeWorkoutStartedAt.value ?? Date.now()).toISOString()
      checkForRecord(data.exercise_id, data.id, data.reps ?? 0, data.weight, data.weight_unit, data.level, loadType, performedAt)
    }

    if (retry) {
      const found = await findSavedSet()
      if (found.error) return { data: null, error: found.error, reconciled: false }
      if (found.data) {
        acceptSavedSet(found.data)
        return { data: found.data, error: null, reconciled: true }
      }
    }

    // set_index below is a placeholder only, to satisfy the not-null
    // column — two addSet calls fired close together can both read the
    // same activeSets.value.length before either insert lands, so this
    // value can't be trusted. The insert (backlog item 10,
    // src/data/sqlite/repos.ts) computes the real position inside its
    // transaction, which is what comes back in `data` below.
    progressSetsStale.value = true
    const write = repos.workouts.insertSet({
      id: setId,
      workout_id: workoutId,
      exercise_id: exerciseId,
      set_index: activeSets.value.length,
      ...setFields(reps, weight, weightUnit, rpe, level, durationSeconds, distance, distanceUnit, incline, calories),
    })
    pendingWrites.add(write)
    let result: Awaited<typeof write>
    try {
      result = await write
    } catch (cause) {
      result = { data: null, error: cause instanceof Error ? cause : new Error(String(cause)) }
    } finally {
      pendingWrites.delete(write)
    }
    const { data, error } = result

    if (!error && data) {
      acceptSavedSet(data)
    }
    if (error && retry && 'code' in error && error.code === '23505') {
      // The first insert may have landed between the lookup and this insert.
      // Only the matching persisted row is proof of success.
      const found = await findSavedSet()
      if (found.error) return { data: null, error: found.error, reconciled: false }
      if (found.data) {
        acceptSavedSet(found.data)
        return { data: found.data, error: null, reconciled: true }
      }
    }
    return { data, error, reconciled: false }
  }

  // Backlog item 9: a workout finished (or abandoned) with zero sets logged
  // shouldn't survive — it shadows real workouts in the "last time" lookup
  // (see fetchPreviousWorkout) and would skew any future reporting that
  // scans `workouts` directly. Delete it instead of leaving an empty row.
  // Backlog item 13: fix a fat-fingered reps/weight/rpe entry on a set still
  // in the active, not-yet-finished workout. Only touches activeSets — the
  // History view's past workouts have no edit affordance and shouldn't.
  async function updateSet(
    id: string,
    reps: number | null,
    weight: number,
    weightUnit: WeightUnit,
    rpe: number | null,
    level: number | null = null,
    durationSeconds: number | null = null,
    distance: number | null = null,
    distanceUnit: DistanceUnit | null = null,
    incline: number | null = null,
    calories: number | null = null,
  ) {
    const { error } = await repos.workouts.updateSet(
      id,
      setFields(reps, weight, weightUnit, rpe, level, durationSeconds, distance, distanceUnit, incline, calories),
    )
    if (!error) {
      progressSetsStale.value = true
      const set = activeSets.value.find((s) => s.id === id)
      // Issue #475: an edited set's small wins no longer hold, and the
      // exercise's earlier sets are re-read on its next check.
      dropSmallWin(id)
      if (set) bestMarkerCache.delete(set.exercise_id)
      if (set) {
        set.reps = reps
        set.weight = weight
        set.weight_unit = weightUnit
        set.rpe = rpe
        set.level = level
        set.duration_seconds = durationSeconds
        set.distance = distance
        set.distance_unit = distanceUnit
        set.incline = incline
        set.calories = calories
      }
    }
    return { error }
  }

  // Backlog item 13: remove a set logged in error from the active workout.
  // Deliberately doesn't renumber set_index on the remaining rows — see
  // docs/backlog-archive.md item 9's pre-fill note on why gaps are harmless.
  async function deleteSet(id: string) {
    const { error } = await repos.workouts.deleteSet(id)
    if (!error) {
      progressSetsStale.value = true
      const set = activeSets.value.find((s) => s.id === id)
      dropSmallWin(id)
      if (set) bestMarkerCache.delete(set.exercise_id)
      activeSets.value = activeSets.value.filter((s) => s.id !== id)
    }
    return { error }
  }

  // Issue #158: `events` is the workout's story (lib/workoutEvents.ts), saved
  // with it. Written even when null, so a resumed and refinished workout
  // drops a story that no longer holds.
  // Issue #266: also stamps finished_at, so History can show the length. A
  // resumed workout clears it (resumeJustFinishedWorkout), and the next Finish
  // stamps it again.
  async function finishWorkout(events: WorkoutEvent[] | null = null, finishedAt: Date = new Date()) {
    await waitForPendingWrites()

    const finishedWorkoutId = activeWorkoutId.value
    const hadSets = activeSets.value.length > 0
    const finishedTemplateName = activeTemplateId.value
      ? useTemplatesStore().templates.find((t) => t.id === activeTemplateId.value)?.name
      : undefined

    if (finishedWorkoutId && hadSets) {
      const write = repos.workouts.updateWorkoutEvents(finishedWorkoutId, events)
      pendingWrites.add(write)
      const finishedIso = finishedAt.toISOString()
      const stampWrite = repos.workouts.updateWorkoutFinishedAt(finishedWorkoutId, finishedIso)
      pendingWrites.add(stampWrite)
      stampWrite.then(({ error }) => {
        pendingWrites.delete(stampWrite)
        if (error) return
        const entry = history.value.find((w) => w.id === finishedWorkoutId)
        if (entry) entry.finished_at = finishedIso
      })
      write.then(({ error }) => {
        pendingWrites.delete(write)
        if (error) return
        const next = { ...workoutEvents.value }
        if (events) next[finishedWorkoutId] = events
        else delete next[finishedWorkoutId]
        workoutEvents.value = next
        const entry = history.value.find((w) => w.id === finishedWorkoutId)
        if (entry) entry.events = events
      })
      // Issue #430: a restore point after every finished workout (local
      // mode only), once both writes have landed, then (#432) the automatic copy.
      void Promise.all([write, stampWrite]).then(() =>
        saveCopiesAfterFinish(finishedTemplateName ? `After ${finishedTemplateName}` : 'After a workout'),
      )
    }

    if (activeWorkoutId.value && activeSets.value.length === 0) {
      await repos.workouts.deleteWorkout(activeWorkoutId.value)
      progressSetsStale.value = true
    }
    activeWorkoutId.value = null
    activeTemplateId.value = null
    activeWorkoutStartedAt.value = null
    activeSets.value = []
    activeExerciseNotes.value = {}
    activeExerciseId.value = ''
    adHocExerciseIds.value = []
    finishSwaps.value = swapOrigins.value
    swappedExercises.value = {}
    swapOrigins.value = {}
    swapRestSource.value = {}
    previousWorkout.value = null
    newRecord.value = null
    newSmallWin.value = null
    smallWinsBySetId.value = {}
    setTargets.clear()
    // The finished workout's sets are now someone's "last time" (#150 found
    // the next workout in the same session still reading the stale cache).
    fallbackPreviousSetsByExercise.value = {}
    lastExerciseNotes.value = {}
    targetHistoryByExercise.value = {}
    persistActiveWorkoutId(null)

    // Only a workout that actually has sets is worth offering to resume — an
    // empty one was just deleted above, same as always.
    justFinishedWorkoutId.value = hadSets ? finishedWorkoutId : null
    justFinishedWorkout.value = null
  }

  // Resume-after-finish item: re-fetches the just-finished workout through
  // the normal signed-in client, same query shape as
  // checkForRecoverableWorkout, so the offer is backed by real server state
  // (not a stale in-memory copy) by the time resumeJustFinishedWorkout runs.
  async function fetchJustFinishedWorkout() {
    const id = justFinishedWorkoutId.value
    if (!id) return

    const { data, error } = await repos.workouts.getWorkout(id)

    // Stale-response guard: this fetch is fired without the caller waiting
    // on it (handleFinish in WorkoutLogger.vue isn't itself awaited from its
    // click handler), so a fast-enough next action — starting a new workout
    // (which clears these two refs itself) or dismissing the offer — can
    // land before this resolves. Applying a response after that would
    // resurrect a stale "Resume your workout?" card over an unrelated
    // session that's already moved on.
    if (justFinishedWorkoutId.value !== id) return

    if (error || !data) {
      justFinishedWorkoutId.value = null
      return
    }
    justFinishedWorkout.value = data
  }

  // Re-attaches activeWorkoutId to the just-finished workout and restores
  // activeTemplateId/activeSets from the server, same restore shape as
  // resumeRecoverableWorkout below.
  function resumeJustFinishedWorkout() {
    const justFinished = justFinishedWorkout.value
    if (!justFinished) return
    activeWorkoutId.value = justFinished.id
    activeTemplateId.value = justFinished.template_id
    activeWorkoutStartedAt.value = new Date(justFinished.performed_at).getTime()
    activeSets.value = justFinished.sets
    activeExerciseNotes.value = exerciseNotesById(justFinished.exercise_notes)
    activeExerciseId.value = ''
    adHocExerciseIds.value = []
    swappedExercises.value = {}
    swapOrigins.value = {}
    swapRestSource.value = {}
    justFinishedWorkout.value = null
    justFinishedWorkoutId.value = null
    persistActiveWorkoutId(justFinished.id)
    // Open again, so it has no finish time until the next Finish.
    const clear = repos.workouts.updateWorkoutFinishedAt(justFinished.id, null)
    pendingWrites.add(clear)
    clear.then(({ error }) => {
      pendingWrites.delete(clear)
      if (error) return
      const entry = history.value.find((w) => w.id === justFinished.id)
      if (entry) entry.finished_at = null
    })
  }

  // Called when the user opts to start a new workout instead of resuming the
  // one they just finished — a non-destructive dismissal, unlike
  // discardRecoverableWorkout below (the just-finished workout stays exactly
  // as finished; only the resume offer goes away).
  function dismissJustFinishedWorkout() {
    justFinishedWorkoutId.value = null
    justFinishedWorkout.value = null
  }

  // Backlog item 31: remove a finished workout logged in error (duplicate,
  // wrong day, test data). `sets.workout_id` has `on delete cascade`
  // (src/data/sqlite/schema.ts), so deleting the workout row alone is enough.
  async function deleteWorkout(id: string) {
    const { error } = await repos.workouts.deleteWorkout(id)
    if (!error) {
      progressSetsStale.value = true
      history.value = history.value.filter((w) => w.id !== id)
    }
    return { error }
  }

  // Backlog item 32: fix a fat-fingered reps/weight/rpe entry, or remove a
  // set entirely, on an already-finished workout from History — same DB
  // write as updateSet/deleteSet above, but reading/writing `history`
  // instead of `activeSets` since a finished workout's sets live there.
  async function updateHistorySet(
    id: string,
    reps: number | null,
    weight: number,
    weightUnit: WeightUnit,
    rpe: number | null,
    level: number | null = null,
    durationSeconds: number | null = null,
    distance: number | null = null,
    distanceUnit: DistanceUnit | null = null,
    incline: number | null = null,
    calories: number | null = null,
  ) {
    const { error } = await repos.workouts.updateSet(
      id,
      setFields(reps, weight, weightUnit, rpe, level, durationSeconds, distance, distanceUnit, incline, calories),
    )
    if (!error) {
      for (const entry of history.value) {
        const set = entry.sets.find((s) => s.id === id)
        if (set) {
          set.reps = reps
          set.weight = weight
          set.weight_unit = weightUnit
          set.rpe = rpe
          set.level = level
          set.duration_seconds = durationSeconds
          set.distance = distance
          set.distance_unit = distanceUnit
          set.incline = incline
          set.calories = calories
          break
        }
      }
    }
    return { error }
  }

  // Backlog item 71: add a brand-new set to an already-finished workout from
  // History (the flat set list previously had no exercise-scoped entry point
  // for this — see WorkoutHistory.vue's exercise picker). Same insert shape
  // as addSet above, but targeting an arbitrary past workout_id instead of
  // activeWorkoutId, and with no rest-timer/record-celebration side effects
  // since the workout is already finished.
  async function addHistorySet(
    workoutId: string,
    exerciseId: string,
    reps: number | null,
    weight: number,
    weightUnit: WeightUnit,
    rpe: number | null,
    level: number | null = null,
    durationSeconds: number | null = null,
    distance: number | null = null,
    distanceUnit: DistanceUnit | null = null,
    incline: number | null = null,
    calories: number | null = null,
  ) {
    const entry = history.value.find((w) => w.id === workoutId)
    const { data, error } = await repos.workouts.insertSetWithExercise({
      workout_id: workoutId,
      exercise_id: exerciseId,
      set_index: entry ? entry.sets.length : 0,
      ...setFields(reps, weight, weightUnit, rpe, level, durationSeconds, distance, distanceUnit, incline, calories),
    })
    if (!error && data) {
      entry?.sets.push(data)
      invalidateHistoryReads()
    }
    return { error }
  }

  async function deleteHistorySet(id: string) {
    const { error } = await repos.workouts.deleteSet(id)
    if (!error) {
      for (const entry of history.value) {
        const index = entry.sets.findIndex((s) => s.id === id)
        if (index !== -1) {
          entry.sets.splice(index, 1)
          break
        }
      }
    }
    return { error }
  }

  // Backlog item 32: fix a missing or wrong note on a finished workout.
  //
  // Issue 8: this write wasn't tracked in pendingWrites, so a Done tap on the
  // finish recap (which saves notes here) followed immediately by opening
  // History could let fetchHistory's query land before this UPDATE did,
  // leaving the just-typed note missing until the next refresh.
  async function updateWorkoutNotes(id: string, notes: string | null) {
    const write = repos.workouts.updateWorkoutNotes(id, notes)
    pendingWrites.add(write)
    let result: Awaited<typeof write>
    try {
      result = await write
    } finally {
      pendingWrites.delete(write)
    }
    const { error } = result
    if (!error) {
      const entry = history.value.find((w) => w.id === id)
      if (entry) entry.notes = notes
      if (workoutNotesFetched.value) {
        const next = { ...workoutNotes.value }
        if (notes?.trim()) next[id] = notes
        else delete next[id]
        workoutNotes.value = next
      }
    }
    return { error }
  }

  // Issue #264: a past workout's sets, or its new date, change what every
  // derived read saw (Lift progress, the calendar, "last time", records), so
  // those refetch next time instead of keeping the old dates.
  function invalidateHistoryReads() {
    progressSetsFetched.value = false
    progressSetsStale.value = true
    feelRowsFetched.value = false
    bestMarkerCache.clear()
    fallbackPreviousSetsByExercise.value = {}
    lastExerciseNotes.value = {}
    targetHistoryByExercise.value = {}
  }

  function sortHistory() {
    history.value = [...history.value].sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime())
  }

  // Issue #264: logs a workout that already happened, with no sets yet. It
  // goes straight into History (never the live logger, so no rest timer,
  // clock, or record celebration), where its sets are added.
  async function logPastWorkout(performedAt: string, templateId: string | null) {
    const { data, error } = await repos.workouts.createWorkout(null, templateId, performedAt)
    if (error || !data) return { id: null, error: error ?? new Error('Could not log that workout.') }
    const templates = useTemplatesStore()
    const name = templateId ? (templates.templates.find((t) => t.id === templateId)?.name ?? null) : null
    history.value.push({ ...data, sets: [], workout_templates: name ? { name } : null })
    sortHistory()
    invalidateHistoryReads()
    return { id: data.id, error: null }
  }

  // Issue #264: moves a finished workout to the date it really happened.
  async function updateWorkoutDate(id: string, performedAt: string) {
    const write = repos.workouts.updateWorkoutDate(id, performedAt)
    pendingWrites.add(write)
    let result: Awaited<typeof write>
    try {
      result = await write
    } finally {
      pendingWrites.delete(write)
    }
    let { error } = result
    const entry = history.value.find((w) => w.id === id)
    // Issue #266's length is finished_at minus performed_at, so the finish
    // moves by the same amount and the length stays what it was.
    if (!error && entry?.finished_at) {
      const shift = new Date(performedAt).getTime() - new Date(entry.performed_at).getTime()
      const finishedAt = new Date(new Date(entry.finished_at).getTime() + shift).toISOString()
      ;({ error } = await repos.workouts.updateWorkoutFinishedAt(id, finishedAt))
      if (!error) entry.finished_at = finishedAt
    }
    if (!error) {
      if (entry) entry.performed_at = performedAt
      sortHistory()
      invalidateHistoryReads()
    }
    return { error }
  }

  // Issue #149: "How did it feel?" tags, from the finish recap or History.
  // Tracked like notes so History never reads before the write lands.
  async function updateWorkoutFeel(id: string, feel: Partial<WorkoutFeel>) {
    const write = repos.workouts.updateWorkoutFeel(id, feel)
    pendingWrites.add(write)
    let result: Awaited<typeof write>
    try {
      result = await write
    } finally {
      pendingWrites.delete(write)
    }
    const { error } = result
    if (!error) {
      for (const entry of [history.value.find((w) => w.id === id), justFinishedWorkout.value?.id === id ? justFinishedWorkout.value : null]) {
        if (entry) Object.assign(entry, feel)
      }
      feelRowsFetched.value = false
    }
    return { error }
  }

  // Issue #158: every workout's story, by workout id, for the chart markers
  // and the Workout log. Workouts with no story aren't in it.
  const workoutEvents = ref<Record<string, WorkoutEvent[]>>({})
  const workoutEventsFetched = ref(false)

  async function fetchWorkoutEvents() {
    await waitForPendingWrites()
    const { data, error } = await repos.workouts.listWorkoutEvents()
    if (error) return
    const byId: Record<string, WorkoutEvent[]> = {}
    for (const row of data) {
      const events = parseWorkoutEvents(row.events)
      if (events.length > 0) byId[row.id] = events
    }
    workoutEvents.value = byId
    workoutEventsFetched.value = true
  }

  // Issue #168: every workout's note, by workout id, for the template chart's
  // markers. Workouts without a note aren't in it.
  const workoutNotes = ref<Record<string, string>>({})
  const workoutNotesFetched = ref(false)

  async function fetchWorkoutNotes() {
    await waitForPendingWrites()
    const { data, error } = await repos.workouts.listWorkoutNotes()
    if (error) return
    const byId: Record<string, string> = {}
    for (const row of data) byId[row.id] = row.notes
    workoutNotes.value = byId
    workoutNotesFetched.value = true
  }

  // Issue #149: tagged workouts, for the "What helps you lift" card.
  const feelRows = ref<FeelWorkoutRow[]>([])
  const feelRowsFetched = ref(false)

  async function fetchFeelRows() {
    await waitForPendingWrites()
    const { data, error } = await repos.workouts.listWorkoutFeels()
    if (error) return
    feelRows.value = data
    feelRowsFetched.value = true
  }

  // Backlog item 1: exercise-by-exercise history detail (ExerciseHistoryDetail.vue),
  // opened from the Exercises tab and the active logger. Same query shape as
  // fetchPreviousWorkout above (base table `workouts`, `sets!inner` embed) --
  // ordering a base-table query by an embedded table's column (sets as the
  // base table, ordering by the embedded workout's performed_at) silently
  // failed to actually sort by it, so this goes through workouts instead,
  // filtering the embedded sets down to just this exercise via
  // `.eq('sets.exercise_id', ...)` (a `!inner` embed filter narrows the
  // nested array itself, not just which parent rows qualify).
  const exerciseHistory = ref<ExerciseHistoryWorkout[]>([])
  const exerciseHistoryLoading = ref(false)
  const exerciseHistoryError = ref('')

  async function fetchExerciseHistory(exerciseId: string) {
    exerciseHistoryLoading.value = true
    exerciseHistoryError.value = ''

    const { data, error } = await repos.workouts.listExerciseHistory(exerciseId)

    if (error) {
      exerciseHistoryError.value = error.message
      exerciseHistoryLoading.value = false
      return
    }

    exerciseHistory.value = data
    exerciseHistoryLoading.value = false
  }

  function clearExerciseHistory() {
    exerciseHistory.value = []
    exerciseHistoryError.value = ''
  }

  // Redesign item 67: ranks the add-exercise sheet's "Recently logged"
  // section by actual recency only (no muscle-group/goal tagging exists to
  // do better — see docs/backlog.md item 67's canvas note n4). Reads the
  // most recent 300 sets' exercise ids in performed_at order and dedupes
  // client-side rather than a DB-side GROUP BY, which PostgREST has no
  // query-builder support for.
  const recentlyLoggedExerciseIds = ref<string[]>([])

  async function fetchRecentlyLoggedExercises() {
    const { data, error } = await repos.workouts.listRecentSetExerciseIds(300)
    if (error) return
    recentlyLoggedExerciseIds.value = [...new Set(data)]
  }

  // Issue #44: every set the user has logged, with its workout's date and
  // template name, for the Progress hub and Lift progress screens. One query
  // (paged past PostgREST's 1000-row cap, same as fetchPriorSets) rather than
  // one per exercise, since the pilot's data is small.
  const progressSets = ref<ProgressSetRow[]>([])
  const progressSetsFetched = ref(false)
  // #463: set by every write that changes a set row, so a screen that already
  // has the all-sets list can skip refetching (and re-deriving) when it's current.
  const progressSetsStale = ref(true)
  let progressSetsRequest = 0

  async function fetchProgressSets() {
    const request = ++progressSetsRequest
    await waitForPendingWrites()
    progressSetsStale.value = false

    const { data, error } = await repos.workouts.listProgressSets()
    if (request !== progressSetsRequest) return
    if (error) return
    progressSets.value = data
    progressSetsFetched.value = true
    // Writes during the fetch re-mark it (the flag is cleared before the await resumes).
  }

  async function fetchHistory() {
    loading.value = true
    errorMessage.value = ''
    await waitForPendingWrites()
    const { data, error } = await repos.workouts.listHistory()

    if (error) {
      errorMessage.value = error.message
    } else {
      history.value = data
    }
    loading.value = false
  }

  return {
    history,
    loading,
    errorMessage,
    activeWorkoutId,
    activeTemplateId,
    activeWorkoutStartedAt,
    activeSets,
    activeExerciseId,
    adHocExerciseIds,
    repeatSetCounts,
    swappedExercises,
    swapOrigins,
    swapRestSource,
    previousWorkout,
    recoverableWorkout,
    justFinishedWorkoutId,
    justFinishedWorkout,
    finishRecap,
    finishMilestones,
    finishUnlockShown,
    finishSwaps,
    commitFinishMilestones,
    exerciseHistory,
    exerciseHistoryLoading,
    exerciseHistoryError,
    recentlyLoggedExerciseIds,
    fetchRecentlyLoggedExercises,
    progressSets,
    progressSetsFetched,
    progressSetsStale,
    fetchProgressSets,
    newRecord,
    newSmallWin,
    recordChecksPending,
    smallWinsBySetId,
    noteSetTarget,
    workoutsThisWeek,
    workoutDaysThisWeek,
    recentPr,
    startWorkout,
    checkForRecoverableWorkout,
    resumeRecoverableWorkout,
    discardRecoverableWorkout,
    fetchJustFinishedWorkout,
    resumeJustFinishedWorkout,
    dismissJustFinishedWorkout,
    resetActiveWorkoutState,
    addSet,
    updateSet,
    deleteSet,
    updateHistorySet,
    deleteHistorySet,
    addHistorySet,
    updateWorkoutNotes,
    updateWorkoutFeel,
    logPastWorkout,
    updateWorkoutDate,
    feelRows,
    feelRowsFetched,
    fetchFeelRows,
    workoutEvents,
    workoutEventsFetched,
    fetchWorkoutEvents,
    workoutNotes,
    workoutNotesFetched,
    fetchWorkoutNotes,
    finishWorkout,
    fetchHistory,
    deleteWorkout,
    fetchPreviousWorkout,
    fetchFallbackPreviousSets,
    activeExerciseNotes,
    lastExerciseNotes,
    fetchLastExerciseNote,
    saveExerciseNote,
    targetHistoryByExercise,
    fetchTargetHistory,
    fetchFinishRecap,
    clearFinishRecap,
    fetchExerciseHistory,
    clearExerciseHistory,
    fetchProgressStats,
  }
})
