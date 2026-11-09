import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { repos } from '../data'
import type { BodyWeightEntry, WeightUnit } from '../lib/types'

// Backlog item 77: a dated log rather than a single profile field, so
// updating today's weight never changes the volume of past bodyweight/
// assisted sets (see docs/architecture.md#data-model).
export const useBodyWeightStore = defineStore('bodyWeight', () => {
  // Newest first, matching the "Log today's weight" card and the weigh-in
  // list item 81 will add.
  const entries = ref<BodyWeightEntry[]>([])
  const loading = ref(false)
  const errorMessage = ref('')
  // Backlog item 78: lets callers outside BodyScreen.vue (the missing-weight
  // prompt, PR/volume computations in stores/workouts.ts) tell "fetched, and
  // there are genuinely zero entries" apart from "never fetched yet" —
  // `entries.length === 0` can't distinguish those two.
  const fetched = ref(false)

  const latestEntry = computed(() => entries.value[0] ?? null)

  // Issue #125: bumped by every local write. A list fetched before a write
  // can arrive after it (BodyScreen.vue fetches on mount while someone is
  // already saving), and assigning it would drop the new weigh-in, so a
  // fetch that saw a write land mid-flight asks again instead.
  let writes = 0

  async function fetchEntries() {
    loading.value = true
    errorMessage.value = ''
    let seen: number
    let result: Awaited<ReturnType<typeof repos.bodyWeight.list>>
    do {
      seen = writes
      result = await repos.bodyWeight.list()
    } while (seen !== writes)
    const { data, error } = result
    if (error) {
      errorMessage.value = error.message
    } else {
      entries.value = data ?? []
      fetched.value = true
    }
    loading.value = false
  }

  async function logWeight(weight: number, unit: WeightUnit) {
    const { data, error } = await repos.bodyWeight.create(weight, unit)
    writes++

    if (!error && data) {
      entries.value = [data, ...entries.value].sort(
        (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
      )
    }
    return { data, error }
  }

  // Backlog item 81: weigh-in list's edit/delete. Volume is computed at read
  // time from these entries (docs/architecture.md#data-model), so correcting
  // or removing one here automatically fixes every affected workout's volume
  // next time it's read — no separate recompute step.
  async function updateEntry(id: string, weight: number, unit: WeightUnit, recordedAt: string) {
    const { data, error } = await repos.bodyWeight.update(id, weight, unit, recordedAt)
    writes++
    if (!error && data) {
      entries.value = entries.value
        .map((e) => (e.id === id ? data : e))
        .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
    }
    return { data, error }
  }

  async function deleteEntry(id: string) {
    const { error } = await repos.bodyWeight.remove(id)
    writes++
    if (!error) {
      entries.value = entries.value.filter((e) => e.id !== id)
    }
    return { error }
  }

  // Item 84's pattern: cleared before a refetch (lib/refetchAccountData.ts).
  function resetBodyWeightState() {
    entries.value = []
    errorMessage.value = ''
    fetched.value = false
  }

  return {
    entries,
    latestEntry,
    loading,
    errorMessage,
    fetched,
    fetchEntries,
    logWeight,
    updateEntry,
    deleteEntry,
    resetBodyWeightState,
  }
})
