<script setup lang="ts">
import { computed } from 'vue'
import { BAR_OPTIONS } from '../lib/plates'
import type { BarbellFields } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import type { BarType, WeightUnit } from '../lib/types'

// Issue #22: the exercise edit form's "Uses a barbell" switch and bar
// choice (docs/design/issue-22-plate-calculator.html, screen 4 top).
// `guess` is what an undecided (uses_barbell null) exercise falls back to.
const props = defineProps<{ modelValue: BarbellFields; guess: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: BarbellFields] }>()

const profile = useProfileStore()

const on = computed(() => props.modelValue.uses_barbell ?? props.guess)
const barType = computed<BarType>(() => props.modelValue.bar_type ?? 'standard')
const customUnit = computed<WeightUnit>(() => props.modelValue.bar_custom_unit ?? profile.defaultWeightUnit)

function update(patch: Partial<BarbellFields>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

function pick(type: BarType) {
  update({
    uses_barbell: true,
    bar_type: type,
    bar_custom_weight: type === 'custom' ? props.modelValue.bar_custom_weight : null,
    bar_custom_unit: type === 'custom' ? customUnit.value : null,
  })
}

function setCustomWeight(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  update({ bar_custom_weight: value > 0 ? value : null, bar_custom_unit: customUnit.value })
}
</script>

<template>
  <div class="barbell-group">
    <div class="switch-row">
      <span class="group-title" aria-hidden="true">Uses a barbell</span>
      <button
        type="button"
        role="switch"
        class="switch"
        :aria-checked="on"
        aria-label="Uses a barbell"
        @click="update({ uses_barbell: !on })"
      >
        <span class="knob" aria-hidden="true"></span>
      </button>
    </div>
    <p class="group-sub">Shows the Plates button while you log this exercise.</p>
    <template v-if="on">
      <div class="bar-options" role="group" aria-label="Bar">
        <button
          v-for="option in BAR_OPTIONS"
          :key="option.value"
          type="button"
          class="bar-option"
          :aria-pressed="barType === option.value"
          @click="pick(option.value)"
        >
          {{ option.lb }} lb<small>{{ option.label }}</small>
        </button>
        <button type="button" class="bar-option" :aria-pressed="barType === 'custom'" @click="pick('custom')">Other</button>
      </div>
      <div v-if="barType === 'custom'" class="custom-bar">
        <input
          type="number"
          inputmode="decimal"
          min="0"
          step="any"
          aria-label="Bar weight"
          :value="modelValue.bar_custom_weight ?? ''"
          @input="setCustomWeight"
        />
        <span class="unit-toggle" role="group" aria-label="Bar weight unit">
          <button
            v-for="u in (['lb', 'kg'] as const)"
            :key="u"
            type="button"
            class="unit-btn"
            :aria-pressed="customUnit === u"
            @click="update({ bar_custom_unit: u })"
          >
            {{ u }}
          </button>
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.barbell-group {
  margin: 12px 0 4px;
  padding: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.group-title {
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--text);
}

.group-sub {
  margin: 4px 0 12px;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.switch {
  position: relative;
  width: 46px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 14px;
  background: var(--border);
  border: none;
}

.switch[aria-checked='true'] {
  background: var(--accent);
}

.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: left 0.15s ease;
}

.switch[aria-checked='true'] .knob {
  left: 21px;
  background: var(--accent-text);
}

.bar-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.bar-option {
  min-height: 0;
  padding: 9px 0;
  border-radius: 10px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.bar-option small {
  font-size: 0.64rem;
  font-weight: 700;
}

.bar-option[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.custom-bar {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.custom-bar input {
  flex: 1;
  min-width: 0;
}

.unit-toggle {
  display: flex;
  gap: 4px;
}

.unit-btn {
  width: 48px;
  min-height: 40px;
  padding: 0;
  background: var(--surface);
  font-weight: 700;
}

.unit-btn[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}
</style>
