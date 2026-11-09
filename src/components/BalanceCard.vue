<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { hasPremium } from '../lib/premium'
import {
  BALANCE_LABELS,
  BALANCE_NUDGES,
  balanceCounts,
  balancePairs,
  uncountedExerciseIds,
  uncountedLine,
  type BalancePair,
} from '../lib/balance'
import { libraryMovementOf } from '../lib/exerciseLibrary'
import { formatSets } from '../lib/muscleVolume'
import PremiumMark from './PremiumMark.vue'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'
import TrialNote from './TrialNote.vue'

// Issue #138: the Muscle groups screen's Balance card, push vs pull and upper
// vs lower sets over the last 4 weeks (lib/balance.ts). Premium (feature key
// `progress`); free users get a preview of a sample, never their own, like
// What helps you lift. MuscleProgress renders it once both stores are loaded.
const workout = useWorkoutsStore()
const exercises = useExercisesStore()

const counts = computed(() => balanceCounts(workout.progressSets, exercises.exercises, libraryMovementOf))
const pairs = computed(() => balancePairs(counts.value))
const hasSets = computed(() => Object.values(counts.value).some((n) => n > 0))
// Issue #173: upper-body exercises with no push or pull yet sit out of push
// vs pull; a quiet line under that split links to the screen that asks.
const uncounted = computed(() => uncountedExerciseIds(workout.progressSets, exercises.exercises, libraryMovementOf).size)
const unlocked = computed(() => hasPremium('progress'))
const previewing = ref(false)

const SAMPLE: BalancePair[] = [
  { key: 'push-pull', a: 'push', b: 'pull', aSets: 34, bSets: 18, behind: 'pull' },
  { key: 'upper-lower', a: 'upper', b: 'lower', aSets: 58, bSets: 44, behind: null },
]

function share(pair: BalancePair): string {
  const total = pair.aSets + pair.bSets
  return `${total === 0 ? 50 : (pair.aSets / total) * 100}%`
}

function pairLabel(pair: BalancePair): string {
  return `${BALANCE_LABELS[pair.a]} ${formatSets(pair.aSets)} sets, ${BALANCE_LABELS[pair.b]} ${formatSets(pair.bSets)} sets`
}
</script>

<template>
  <section v-if="hasSets" class="balance-card" aria-labelledby="balance-card-title" data-testid="balance-card">
    <h3 id="balance-card-title" class="balance-title">Balance<PremiumMark v-if="!unlocked" /></h3>

    <template v-if="unlocked">
      <TrialNote feature="progress" />
      <p class="balance-sub">Sets in the last 4 weeks.</p>
      <div v-for="pair in pairs" :key="pair.key" class="pair" :data-testid="`balance-${pair.key}`">
        <div class="pair-head" :aria-label="pairLabel(pair)" role="group">
          <span><b>{{ BALANCE_LABELS[pair.a] }}</b> {{ formatSets(pair.aSets) }}</span>
          <span>{{ formatSets(pair.bSets) }} <b>{{ BALANCE_LABELS[pair.b] }}</b></span>
        </div>
        <div class="split" aria-hidden="true">
          <i class="side-a" :style="{ width: share(pair) }"></i>
          <i class="side-b"></i>
        </div>
        <p v-if="pair.behind" class="nudge" data-testid="balance-nudge">{{ BALANCE_NUDGES[pair.behind] }}</p>
        <p v-if="pair.key === 'push-pull' && uncounted > 0" class="uncounted" data-testid="balance-uncounted">
          {{ uncountedLine(uncounted) }}
          <router-link :to="{ name: 'push-pull-check' }">Set push or pull <span aria-hidden="true">›</span></router-link>
        </p>
      </div>
    </template>

    <template v-else>
      <p class="balance-sub">Compare your push vs pull and upper vs lower body sets over the last 4 weeks.</p>
      <button v-if="!previewing" type="button" class="preview-button" @click="previewing = true">Preview</button>
      <div v-else class="preview">
        <div class="sample" aria-hidden="true">
          <div v-for="pair in SAMPLE" :key="pair.key" class="pair">
            <div class="pair-head">
              <span><b>{{ BALANCE_LABELS[pair.a] }}</b> {{ pair.aSets }}</span>
              <span>{{ pair.bSets }} <b>{{ BALANCE_LABELS[pair.b] }}</b></span>
            </div>
            <div class="split">
              <i class="side-a" :style="{ width: share(pair) }"></i>
              <i class="side-b"></i>
            </div>
            <p v-if="pair.behind" class="nudge">{{ BALANCE_NUDGES[pair.behind] }}</p>
          </div>
        </div>
        <div class="preview-overlay">
          <PremiumPreviewPanel
            feature="progress"
            title="Balance is part of Premium"
            body="Muscle groups and your weekly sets stay free."
            @back="previewing = false"
          />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.balance-card {
  margin-top: 12px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.balance-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.15;
}

.balance-sub {
  margin: 4px 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.pair {
  margin-top: 12px;
}

.pair-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
  font-family: var(--font-display);
  font-size: 1rem;
}

.pair-head b {
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-dim);
}

.split {
  display: flex;
  gap: 2px;
  height: 8px;
}

.split i {
  display: block;
  border-radius: 4px;
}

.side-a {
  background: var(--accent);
}

.side-b {
  flex: 1;
  background: var(--secondary);
}

.nudge {
  margin: 6px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.uncounted {
  margin: 6px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.uncounted a {
  font-weight: 700;
  color: var(--highlight);
  text-decoration: none;
  white-space: nowrap;
}

.preview-button {
  min-height: 40px;
  margin-top: 10px;
  padding: 0 16px;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
  font-size: 0.86rem;
  font-weight: 700;
}

.preview {
  position: relative;
  margin-top: 4px;
}

.sample {
  filter: blur(4px);
  user-select: none;
  min-height: 190px;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
</style>
