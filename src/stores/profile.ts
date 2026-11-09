import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { repos } from '../data'
import { DEFAULT_PLATES } from '../lib/plates'
import type { HeightUnit, WeightReminder, WeightUnit } from '../lib/types'

// Backlog item 77: height and the two reminder-related toggles live as
// single profile columns (see docs/architecture.md#data-model) — body
// weight itself is a dated log, handled by stores/bodyWeight.ts instead.
export const useProfileStore = defineStore('profile', () => {
  const height = ref<number | null>(null)
  const heightUnit = ref<HeightUnit | null>(null)
  const missingWeightPromptOptOut = ref(false)
  const weightReminder = ref<WeightReminder>('monthly')
  // Issue #22: "Plates at my gym", one list per unit.
  const plates = ref<Record<WeightUnit, number[]>>({ lb: [...DEFAULT_PLATES.lb], kg: [...DEFAULT_PLATES.kg] })
  // Issue #53: the unit new sets fall back to when nothing more specific
  // (the same set last time) applies. Null until the user picks one, which
  // App.vue asks for once via WeightUnitSheet.vue.
  const weightUnit = ref<WeightUnit | null>(null)
  const defaultWeightUnit = computed<WeightUnit>(() => weightUnit.value ?? 'lb')
  // Issue #90: rest timer for exercises without their own rest_seconds.
  // Null means no timer for them.
  const defaultRestSeconds = ref<number | null>(null)
  const loading = ref(false)
  const errorMessage = ref('')
  // Backlog item 78: lets callers outside BodyScreen.vue (the missing-weight
  // prompt) know whether missingWeightPromptOptOut reflects a real fetch yet,
  // same reasoning as bodyWeight.ts's own `fetched` flag.
  const fetched = ref(false)

  // Issue #125: bumped on both sides of every write. A profile fetched
  // before a write can arrive after it (BodyScreen.vue refetches on mount
  // while someone is already saving their height), and assigning it would
  // put the old values back, so a fetch that saw a write mid-flight asks
  // again instead. Both sides, because the optimistic writes below change
  // local state before their request goes out.
  let writes = 0

  async function update(fields: Parameters<typeof repos.profile.update>[0]) {
    writes++
    try {
      return await repos.profile.update(fields)
    } finally {
      writes++
    }
  }

  async function fetchProfile() {
    loading.value = true
    errorMessage.value = ''
    let seen: number
    let result: Awaited<ReturnType<typeof repos.profile.get>>
    do {
      seen = writes
      result = await repos.profile.get()
    } while (seen !== writes)
    const { data, error } = result
    if (error) {
      errorMessage.value = error.message
    } else if (data) {
      height.value = data.height
      heightUnit.value = data.height_unit
      missingWeightPromptOptOut.value = data.missing_weight_prompt_opt_out
      weightReminder.value = data.weight_reminder
      plates.value = { lb: (data.plates_lb ?? []).map(Number), kg: (data.plates_kg ?? []).map(Number) }
      weightUnit.value = data.weight_unit
      defaultRestSeconds.value = data.default_rest_seconds ?? null
      fetched.value = true
    }
    loading.value = false
  }

  async function updateHeight(value: number, unit: HeightUnit) {
    const { error } = await update({ height: value, height_unit: unit })
    if (!error) {
      height.value = value
      heightUnit.value = unit
    }
    return { error }
  }

  async function updateMissingWeightPromptOptOut(optOut: boolean) {
    const { error } = await update({ missing_weight_prompt_opt_out: optOut })
    if (!error) missingWeightPromptOptOut.value = optOut
    return { error }
  }

  async function updateWeightReminder(cadence: WeightReminder) {
    const { error } = await update({ weight_reminder: cadence })
    if (!error) weightReminder.value = cadence
    return { error }
  }

  async function updatePlates(unit: WeightUnit, list: number[]) {
    const previous = plates.value[unit]
    plates.value = { ...plates.value, [unit]: list }
    const { error } = await update(unit === 'lb' ? { plates_lb: list } : { plates_kg: list })
    if (error) plates.value = { ...plates.value, [unit]: previous }
    return { error }
  }

  async function updateWeightUnit(unit: WeightUnit) {
    const previous = weightUnit.value
    weightUnit.value = unit
    const { error } = await update({ weight_unit: unit })
    if (error) weightUnit.value = previous
    return { error }
  }

  async function updateDefaultRestSeconds(seconds: number | null) {
    const previous = defaultRestSeconds.value
    defaultRestSeconds.value = seconds
    const { error } = await update({ default_rest_seconds: seconds })
    if (error) defaultRestSeconds.value = previous
    return { error }
  }

  // Issue #53: WeightUnitSheet.vue suggests whichever unit most logged sets
  // use. Null when there are none to go by.
  async function suggestWeightUnit(): Promise<WeightUnit | null> {
    const [lb, kg] = await Promise.all([repos.workouts.countWeightedSets('lb'), repos.workouts.countWeightedSets('kg')])
    if (lb + kg === 0) return null
    return kg > lb ? 'kg' : 'lb'
  }

  // Item 84's pattern: clears the cached profile fields before a refetch
  // (lib/refetchAccountData.ts), so old height/reminder settings can't show
  // briefly before fetchProfile() runs again.
  function resetProfileState() {
    height.value = null
    heightUnit.value = null
    missingWeightPromptOptOut.value = false
    weightReminder.value = 'monthly'
    plates.value = { lb: [...DEFAULT_PLATES.lb], kg: [...DEFAULT_PLATES.kg] }
    weightUnit.value = null
    defaultRestSeconds.value = null
    errorMessage.value = ''
    fetched.value = false
  }

  return {
    height,
    heightUnit,
    missingWeightPromptOptOut,
    weightReminder,
    plates,
    weightUnit,
    defaultWeightUnit,
    defaultRestSeconds,
    loading,
    errorMessage,
    fetched,
    fetchProfile,
    updateHeight,
    updateMissingWeightPromptOptOut,
    updateWeightReminder,
    updatePlates,
    updateWeightUnit,
    updateDefaultRestSeconds,
    suggestWeightUnit,
    resetProfileState,
  }
})
