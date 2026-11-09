<script setup lang="ts">
import { computed } from 'vue'
import { isPremium, openPremiumSheet } from '../lib/premium'
import { currentTrial, type TrialFeature } from '../lib/trialPass'

// Issue #155: the small note in an area a trial pass has opened: how long is
// left, and one quiet link to keep it. Nothing shows outside a trial.
const props = defineProps<{ feature: TrialFeature }>()

const trial = computed(() => (!isPremium.value && currentTrial.value?.feature === props.feature ? currentTrial.value : null))
</script>

<template>
  <p v-if="trial" class="trial-note" data-testid="trial-note">
    <span class="trial-days">Trial: {{ trial.daysLeft }} {{ trial.daysLeft === 1 ? 'day' : 'days' }} left</span>
    <button type="button" class="trial-keep" @click="openPremiumSheet(feature)">Keep it with Premium</button>
  </p>
</template>

<style scoped>
.trial-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 10px;
  margin: 0;
  padding: 7px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--secondary) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--secondary) 35%, var(--border));
  font-size: 0.8rem;
}

.trial-days {
  font-weight: 700;
  color: var(--text);
}

.trial-keep {
  min-height: 32px;
  padding: 0 4px;
  background: none;
  border: none;
  color: var(--secondary);
  font-size: 0.8rem;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.trial-keep:active {
  transform: none;
}
</style>
