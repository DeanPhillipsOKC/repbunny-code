<script setup lang="ts">
import { computed } from 'vue'
import HowToSection from './HowToSection.vue'
import { trackedAsLabel, type LibraryExercise } from '../lib/exerciseLibrary'
import { MUSCLE_GROUP_LABELS } from '../lib/muscleGroups'

// Issue #39: a library entry's muscle line, Equipment / Tracked as facts,
// and how-to steps. Issue #313 shares it between the Library detail screen
// and the Add exercise sheet's in-place detail, so opening an entry from the
// sheet no longer leaves the sheet.
const props = defineProps<{ entry: LibraryExercise }>()

const muscleLine = computed(() => {
  const main = MUSCLE_GROUP_LABELS[props.entry.muscleGroup]
  if (props.entry.alsoWorks.length === 0) return main
  return `${main} · also works ${props.entry.alsoWorks.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ')}`
})
</script>

<template>
  <p class="hero-sub">{{ muscleLine }}</p>

  <div class="facts">
    <div class="fact">
      <div class="fact-key">Equipment</div>
      <div class="fact-value">{{ entry.equipment }}</div>
    </div>
    <div class="fact">
      <div class="fact-key">Tracked as</div>
      <div class="fact-value">{{ trackedAsLabel(entry) }}</div>
    </div>
  </div>

  <HowToSection :steps="entry.howTo" />
</template>

<style scoped>
.hero-sub {
  margin: -6px 0 14px;
  color: var(--text-dim);
  font-size: 0.84rem;
}

.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}

.fact {
  min-width: 0;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.fact-key {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.fact-value {
  margin-top: 3px;
  font-size: 0.9rem;
  font-weight: 700;
}
</style>
