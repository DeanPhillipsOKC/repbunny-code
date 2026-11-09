// Issue #153/#154: the live milestone counts and this device's seen tiers,
// shared by the Milestones screen and the Theme screen's Extras. Call from a
// component's setup: it fetches what it needs on mount.
import { computed, onMounted, ref, watch } from 'vue'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { importedTierIds, initSeenTiers, milestoneCounts, pendingIntro, readSeenTiers, TIERS } from './milestones'
import { isPremium } from './premium'

export function useMilestoneState() {
  const workout = useWorkoutsStore()
  const exercises = useExercisesStore()
  const bodyWeight = useBodyWeightStore()

  onMounted(() => {
    workout.fetchProgressSets()
    if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
    if (!bodyWeight.fetched) bodyWeight.fetchEntries()
  })

  const ready = computed(() => workout.progressSetsFetched && exercises.fetched && bodyWeight.fetched)

  const finishedRows = computed(() => workout.progressSets.filter((s) => s.workout_id !== workout.activeWorkoutId))
  const loadTypeOf = computed(() => {
    const loadTypes = new Map(exercises.exercises.map((e) => [e.id, e.load_type]))
    return (id: string) => loadTypes.get(id) ?? 'weight'
  })
  // A workout still in progress counts once it's finished.
  const counts = computed(() => milestoneCounts(finishedRows.value, loadTypeOf.value, bodyWeight.entries))
  // Tiers an import crossed (#462): shown as "Before RepBunny".
  const importedTiers = computed(() => importedTierIds(finishedRows.value, loadTypeOf.value, bodyWeight.entries))

  const seen = ref<Set<string>>(readSeenTiers() ?? new Set())
  const intro = ref<string | null>(pendingIntro())

  // First visit before any finish since milestones shipped: what the history
  // already reached counts as unlocked, with the one-time note.
  watch(
    ready,
    (isReady) => {
      if (!isReady || readSeenTiers()) return
      seen.value = initSeenTiers(counts.value, isPremium.value, importedTiers.value)
      intro.value = pendingIntro()
    },
    { immediate: true },
  )

  // Tiers unlocked now: reached by the count, or already shown on this device
  // (deletes can lower the count, but never take back what was unlocked).
  // Extras read this, so a tier an import crossed (#462) counts only once
  // it has been shown here; it never unlocks an Extra from the count alone.
  const unlockedTiers = computed(
    () =>
      new Set(
        TIERS.filter(
          (t) => seen.value.has(t.id) || (ready.value && counts.value[t.track] >= t.count && !importedTiers.value.has(t.id)),
        ).map((t) => t.id),
      ),
  )

  return { ready, counts, seen, intro, unlockedTiers, importedTiers }
}
