<script setup lang="ts">
// Issue #136: the one question strength levels need, shared by the strength
// screen (asked once, the first time it opens) and Account > Preferences, so
// both explain why it's asked and what skipping costs before an answer.
import { STRENGTH_SEX_OPTIONS, STRENGTH_SEX_SKIP, STRENGTH_SEX_WHY, setStrengthSex, strengthSex, type StrengthSexAnswer } from '../lib/strengthLevels'

const emit = defineEmits<{ picked: [value: StrengthSexAnswer] }>()

function pick(value: StrengthSexAnswer) {
  setStrengthSex(value)
  emit('picked', value)
}
</script>

<template>
  <div class="sex-picker">
    <p class="why" data-testid="strength-sex-why">{{ STRENGTH_SEX_WHY }}</p>
    <p class="skip" data-testid="strength-sex-skip">{{ STRENGTH_SEX_SKIP }}</p>
    <div role="group" aria-label="Sex for strength standards" class="options">
      <button
        v-for="option in STRENGTH_SEX_OPTIONS"
        :key="option.value"
        type="button"
        :class="{ active: strengthSex === option.value }"
        :aria-pressed="strengthSex === option.value"
        @click="pick(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.why,
.skip {
  margin: 0 0 6px;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.skip {
  margin-bottom: 10px;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.options button {
  flex: 1 1 auto;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
  font-size: 0.86rem;
}

.options button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}
</style>
