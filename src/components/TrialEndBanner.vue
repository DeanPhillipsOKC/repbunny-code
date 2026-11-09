<script setup lang="ts">
import { computed } from 'vue'
import { openAccountSheet } from '../lib/accountSheet'
import { isPremium, openPremiumSheet } from '../lib/premium'
import { themeLabel } from '../lib/theme'
import { dismissTrialEndNote, endedTrial, trialEndNote, trialFeatureLabel } from '../lib/trialPass'

// Issue #155: the one note when a trial pass ends, on Home outside a workout
// (same place and shape as WhatsNewBanner). Either button settles it for good;
// there's never a second nudge. #1002: the setup Themes trial's note names
// its theme and adds Change theme (Preferences › Theme).
const feature = computed(() => (isPremium.value ? null : trialEndNote.value))
const setupTheme = computed(() => {
  const trial = endedTrial.value
  return feature.value && trial?.setup ? themeLabel(trial.theme ?? 'classic') : null
})

function keep() {
  const f = feature.value
  dismissTrialEndNote()
  if (f) openPremiumSheet(f)
}

function changeTheme() {
  dismissTrialEndNote()
  openAccountSheet('theme')
}
</script>

<template>
  <div v-if="feature" class="trial-end-banner" role="region" aria-label="Trial ended">
    <div v-if="setupTheme" class="banner-text">
      <p class="banner-title">Your {{ setupTheme }} trial ended, so you're back on Classic.</p>
      <div class="banner-links">
        <button type="button" class="banner-link" @click="keep">Keep {{ setupTheme }} with Premium</button>
        <button type="button" class="banner-link" @click="changeTheme">Change theme</button>
      </div>
    </div>
    <div v-else class="banner-text">
      <p class="banner-title">Your trial of {{ trialFeatureLabel(feature) }} ended.</p>
      <button type="button" class="banner-link" @click="keep">Keep it with Premium?</button>
    </div>
    <button type="button" class="banner-close" aria-label="Close" @click="dismissTrialEndNote">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.trial-end-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
  padding: 12px 10px 12px 14px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--secondary) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--secondary) 45%, var(--border));
}

.banner-text {
  flex: 1;
  min-width: 0;
}

.banner-title {
  margin: 0;
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--text);
}

.banner-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0 16px;
}

.banner-link {
  min-height: 32px;
  margin-top: 2px;
  padding: 0;
  background: transparent;
  border: none;
  font-size: 0.84rem;
  font-weight: 800;
  color: var(--secondary);
}

.banner-close {
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 9px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
