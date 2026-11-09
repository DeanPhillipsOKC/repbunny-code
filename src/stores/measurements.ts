import { ref } from 'vue'
import { defineStore } from 'pinia'
import { repos } from '../data'
import type { BodyMeasurement, HeightUnit, MeasurementValues } from '../lib/types'

// Issue #139: tape measurements, newest first, same shape as the weigh-in
// store (stores/bodyWeight.ts), including its fetch-vs-write guard (#125).
export const useMeasurementsStore = defineStore('measurements', () => {
  const entries = ref<BodyMeasurement[]>([])
  const loading = ref(false)
  const errorMessage = ref('')
  const fetched = ref(false)
  let writes = 0

  const newestFirst = (a: BodyMeasurement, b: BodyMeasurement) => b.recorded_at.localeCompare(a.recorded_at)

  async function fetchEntries() {
    loading.value = true
    errorMessage.value = ''
    let seen: number
    let result: Awaited<ReturnType<typeof repos.measurements.list>>
    do {
      seen = writes
      result = await repos.measurements.list()
    } while (seen !== writes)
    const { data, error } = result
    if (error) {
      errorMessage.value = error.message
    } else {
      entries.value = [...(data ?? [])].sort(newestFirst)
      fetched.value = true
    }
    loading.value = false
  }

  async function addEntry(values: MeasurementValues, unit: HeightUnit, recordedAt: string) {
    const { data, error } = await repos.measurements.create(values, unit, recordedAt)
    writes++
    if (!error && data) entries.value = [data, ...entries.value].sort(newestFirst)
    return { data, error }
  }

  async function updateEntry(id: string, values: MeasurementValues, unit: HeightUnit, recordedAt: string) {
    const { data, error } = await repos.measurements.update(id, values, unit, recordedAt)
    writes++
    if (!error && data) entries.value = entries.value.map((e) => (e.id === id ? data : e)).sort(newestFirst)
    return { data, error }
  }

  async function deleteEntry(id: string) {
    const { error } = await repos.measurements.remove(id)
    writes++
    if (!error) entries.value = entries.value.filter((e) => e.id !== id)
    return { error }
  }

  function resetMeasurementsState() {
    entries.value = []
    errorMessage.value = ''
    fetched.value = false
  }

  return { entries, loading, errorMessage, fetched, fetchEntries, addEntry, updateEntry, deleteEntry, resetMeasurementsState }
})
