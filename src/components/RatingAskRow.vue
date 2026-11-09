<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { ratingAskOn, setRatingAskOn } from '../lib/storeRating'

// Preferences' "Ask me to rate RepBunny" switch (issue #776). Off means never.
// Native apps only: the browser build never asks, so it has nothing to switch.
const native = Capacitor.getPlatform() !== 'web'
</script>

<template>
  <div v-if="native" class="pref-row">
    <span class="data-text">
      <span id="rating-ask-pref" class="data-title">Ask me to rate RepBunny</span>
      <span class="data-caption">Now and then, after a record. Turn off to never be asked.</span>
    </span>
    <button
      type="button"
      role="switch"
      class="switch"
      :aria-checked="ratingAskOn"
      aria-labelledby="rating-ask-pref"
      @click="setRatingAskOn(!ratingAskOn)"
    >
      <span class="knob" aria-hidden="true"></span>
    </button>
  </div>
</template>

<style scoped>
.data-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.data-title {
  font-weight: 700;
  font-size: 0.95rem;
}

.data-caption {
  margin-top: 1px;
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-dim);
}

.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 10px 10px 14px;
}

.switch {
  position: relative;
  width: 46px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  margin-right: 4px;
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
</style>
