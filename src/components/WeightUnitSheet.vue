<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { WeightUnit } from '../lib/types'
import { useProfileStore } from '../stores/profile'

// Issue #53: asked once after sign-in while profiles.weight_unit is null
// (App.vue decides when). It can't be dismissed without picking, since the
// answer is what every new exercise's first set falls back to. Someone who
// already has sets (the pilot users) sees their most-used unit suggested.
const profile = useProfileStore()

const suggested = ref<WeightUnit | null>(null)
const saving = ref<WeightUnit | null>(null)
const errorMessage = ref('')

const OPTIONS: { unit: WeightUnit; name: string }[] = [
  { unit: 'lb', name: 'Pounds' },
  { unit: 'kg', name: 'Kilograms' },
]

// Weight 0 rows (level, timed, unloaded bodyweight) say nothing about which
// unit someone lifts in, so the suggestion only counts weighted sets.
onMounted(async () => {
  suggested.value = await profile.suggestWeightUnit()
})

async function pick(unit: WeightUnit) {
  if (saving.value) return
  saving.value = unit
  errorMessage.value = ''
  const { error } = await profile.updateWeightUnit(unit)
  saving.value = null
  if (error) errorMessage.value = `Couldn't save that. ${error.message}`
}
</script>

<template>
  <div class="sheet-overlay">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="weight-unit-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h3 id="weight-unit-title" class="sheet-title">Which unit do you lift in?</h3>
      <p class="intro">New exercises start in this unit. You can still switch any exercise, and change this later in Account.</p>

      <div class="options">
        <button
          v-for="option in OPTIONS"
          :key="option.unit"
          type="button"
          class="option"
          :class="{ suggested: suggested === option.unit }"
          :aria-label="option.unit"
          :disabled="!!saving"
          @click="pick(option.unit)"
        >
          <span class="option-unit">{{ option.unit }}</span>
          <span class="option-name">{{ saving === option.unit ? 'Saving…' : option.name }}</span>
        </button>
      </div>

      <p v-if="suggested" class="hint">Most of your logged sets are in {{ suggested }}.</p>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
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

.intro {
  margin: -6px 0 0;
  font-size: 0.88rem;
  color: var(--text-dim);
}

.options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.option {
  min-height: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
}

.option.suggested {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}

.option:disabled {
  opacity: 0.6;
}

.option-unit {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
}

.option.suggested .option-unit {
  color: var(--accent);
}

.option-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
}

.hint {
  margin: -4px 0 0;
  font-size: 0.8rem;
  color: var(--text-dim);
  text-align: center;
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.8rem;
}
</style>
