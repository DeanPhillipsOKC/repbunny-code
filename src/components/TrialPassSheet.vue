<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  TRIAL_DAYS,
  TRIAL_FEATURES,
  currentTrial,
  startTrialPass,
  trialFeatureLabel,
  unusedPassCount,
  type TrialFeature,
} from '../lib/trialPass'
import { TRIAL_USE, goToTrialFeature, trialGuideUrl } from '../lib/trialUse'

// Issue #155: pick which Premium area a trial pass opens, from the recap or
// the Milestones screen. One pass runs at a time, so while one runs this only
// says when the next can start. Rendered once in App.vue.
// Issue #489: a pick doesn't just close: the sheet confirms it and points to
// where the feature lives (a button to it, or where to look, plus its guide).
const emit = defineEmits<{ dismiss: [] }>()
const router = useRouter()

const started = ref<TrialFeature | null>(null)
const startedUse = computed(() => (started.value ? TRIAL_USE[started.value] : null))

const passText = computed(() => (unusedPassCount.value === 1 ? '1 trial pass' : `${unusedPassCount.value} trial passes`))

function pick(feature: TrialFeature) {
  if (startTrialPass(feature)) started.value = feature
}

function useIt() {
  const feature = started.value
  emit('dismiss')
  if (feature) goToTrialFeature(feature, router.push)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('dismiss')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="sheet-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="trial-sheet-title" aria-describedby="trial-sheet-body">
      <div class="sheet-handle" aria-hidden="true"></div>

      <template v-if="started && startedUse">
        <div class="head">
          <span class="eyebrow">Trial pass</span>
          <h3 id="trial-sheet-title" class="sheet-title">{{ trialFeatureLabel(started) }} is on</h3>
          <p id="trial-sheet-body" class="sheet-sub">
            Free for {{ TRIAL_DAYS }} days, exactly like Premium. {{ startedUse.where }}
          </p>
        </div>
        <button v-if="startedUse.action" type="button" class="use-it" @click="useIt">{{ startedUse.action.label }}</button>
        <a class="guide-link" :href="trialGuideUrl(started)" target="_blank" rel="noopener">{{ startedUse.guide.label }}</a>
        <button type="button" class="ghost" @click="emit('dismiss')">Done</button>
      </template>

      <template v-else>
        <div class="head">
          <span class="eyebrow">Trial pass</span>
          <h3 id="trial-sheet-title" class="sheet-title">Try a Premium feature</h3>
          <p v-if="currentTrial" id="trial-sheet-body" class="sheet-sub">
            Your {{ trialFeatureLabel(currentTrial.feature) }} trial has {{ currentTrial.daysLeft }}
            {{ currentTrial.daysLeft === 1 ? 'day' : 'days' }} left. Your next pass waits until it ends.
          </p>
          <p v-else-if="unusedPassCount > 0" id="trial-sheet-body" class="sheet-sub">
            You have {{ passText }}. Pick one feature to use free for {{ TRIAL_DAYS }} days, exactly like Premium.
          </p>
          <p v-else id="trial-sheet-body" class="sheet-sub">Milestones earn trial passes. You don't have one right now.</p>
        </div>

        <ul v-if="!currentTrial && unusedPassCount > 0" class="options" aria-label="Premium features">
          <li v-for="option in TRIAL_FEATURES" :key="option.feature">
            <button type="button" class="option" :aria-label="`Try ${option.label}`" @click="pick(option.feature)">
              <span class="option-name">{{ option.label }}</span>
              <span class="option-sub">{{ option.detail }}</span>
            </button>
          </li>
        </ul>

        <p class="free-note">What you set up during a trial is kept, and comes back if you unlock Premium.</p>

        <button type="button" class="ghost" @click="emit('dismiss')">{{ currentTrial || unusedPassCount === 0 ? 'Close' : 'Later' }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 18px calc(18px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.eyebrow {
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 16%, transparent);
  color: var(--secondary);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sheet-title {
  margin: 2px 0 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

.sheet-sub {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.options {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option {
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 11px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  text-align: left;
  color: var(--text);
}

.option:active {
  transform: none;
  border-color: var(--accent);
}

.option-name {
  font-size: 0.95rem;
  font-weight: 800;
}

.option-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.free-note {
  margin: 0;
  font-size: 0.76rem;
  color: var(--text-dim);
}

.use-it {
  width: 100%;
  min-height: 48px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.guide-link {
  align-self: center;
  padding: 4px;
  color: var(--secondary);
  font-size: 0.85rem;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ghost {
  width: 100%;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}
</style>
