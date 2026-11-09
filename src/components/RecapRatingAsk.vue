<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import type { FinishRecap } from '../lib/finishRecap'
import { repos } from '../data'
import { RATING_ASK_DELAY_MS, askForRating } from '../lib/storeRating'

// Issues #727 and #776: renders nothing. Asks the OS for a store rating a
// moment after the recap appears, when the workout set a record and the
// spacing rules allow it (lib/storeRating.ts).
const props = defineProps<{ recap: FinishRecap }>()

let timer: ReturnType<typeof setTimeout> | undefined
async function ask() {
  try {
    const rows = await repos.backup.listAll('workouts')
    const times = rows.map((row) => Date.parse(String(row.performed_at))).filter((t) => !Number.isNaN(t))
    const first = times.length ? new Date(Math.min(...times)).toISOString() : null
    await askForRating(props.recap, { workouts: rows.length, firstWorkoutAt: first })
  } catch {
    // Can't read the history: skip the ask.
  }
}
onMounted(() => {
  timer = setTimeout(() => void ask(), RATING_ASK_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <span hidden />
</template>
