<script setup lang="ts">
import { ref } from 'vue'
import { useProfileStore } from '../stores/profile'
import { ALL_PLATES, formatWeight, plateStyle } from '../lib/plates'
import type { WeightUnit } from '../lib/types'

// Issue #22/#48: the "Plates at my gym" on/off tile grid. Tapping a tile
// toggles whether the gym has that plate and saves it to the profile.
const props = defineProps<{ unit: WeightUnit }>()

const profile = useProfileStore()
const error = ref('')

async function togglePlate(plate: number) {
  error.value = ''
  const current = profile.plates[props.unit]
  const next = current.includes(plate) ? current.filter((p) => p !== plate) : [...current, plate].sort((a, b) => b - a)
  const result = await profile.updatePlates(props.unit, next)
  if (result.error) error.value = result.error.message
}

function tileStyle(plate: number) {
  const style = plateStyle(plate, props.unit)
  return { width: `${Math.max(style.width, 6)}px`, height: `${Math.round(style.height / 3.2)}px`, background: style.color }
}
</script>

<template>
  <div class="plates-grid">
    <button
      v-for="plate in ALL_PLATES[unit]"
      :key="`${unit}-${plate}`"
      type="button"
      class="plate-tile"
      :aria-pressed="profile.plates[unit].includes(plate)"
      :aria-label="`${formatWeight(plate)} ${unit} plate`"
      @click="togglePlate(plate)"
    >
      <i :style="tileStyle(plate)" aria-hidden="true"></i>
      {{ formatWeight(plate) }}
      <span>{{ profile.plates[unit].includes(plate) ? unit : 'off' }}</span>
    </button>
  </div>
  <p v-if="error" class="error">{{ error }}</p>
</template>

<style scoped>
.plates-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.plate-tile {
  min-height: 0;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border-radius: 12px;
  background: transparent;
  border: 1px dashed var(--border);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 800;
  opacity: 0.38;
}

.plate-tile[aria-pressed='true'] {
  border-style: solid;
  opacity: 1;
}

.plate-tile i {
  display: block;
  border-radius: 4px;
}

.plate-tile span {
  font-size: 0.64rem;
  font-weight: 700;
  color: var(--text-dim);
}

.error {
  margin: 8px 0 0;
  color: var(--danger);
  font-size: 0.8rem;
}
</style>
