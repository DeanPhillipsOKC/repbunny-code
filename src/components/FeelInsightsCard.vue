<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { hasPremium } from '../lib/premium'
import { buildFeelInsights, MIN_TAGGED_WORKOUTS } from '../lib/workoutFeel'
import PremiumMark from './PremiumMark.vue'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'
import TrialNote from './TrialNote.vue'

// Issue #149: the Progress hub's "What helps you lift" card. Compares tagged
// workouts (lib/workoutFeel.ts) once there are MIN_TAGGED_WORKOUTS of them.
// Premium (feature key `progress`); free users get a preview of sample
// findings, never their own, like Strength levels.
const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const bodyWeight = useBodyWeightStore()

onMounted(() => {
  workout.fetchFeelRows()
})

const insights = computed(() => {
  const loadTypes = new Map(exercises.exercises.map((e) => [e.id, e.load_type]))
  return buildFeelInsights(
    workout.feelRows,
    workout.progressSets,
    (id) => loadTypes.get(id) ?? 'weight',
    bodyWeight.entries,
    workout.activeWorkoutId,
  )
})

const ready = computed(() => workout.feelRowsFetched && workout.progressSetsFetched)
const unlocked = computed(() => hasPremium('progress'))
const previewing = ref(false)

const SAMPLE = [
  { text: 'You set 2x more records after over 8 hours of sleep than under 6 hours of sleep.', detail: '1.4 vs 0.7 records a workout.' },
  { text: 'Your est. 1RM rose more when your energy was high than when it was low.', detail: '+2.6% vs +0.4% a session.' },
]

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
</script>

<template>
  <section v-if="ready && insights.tagged > 0" class="feel-card" aria-labelledby="feel-card-title" data-testid="feel-insights">
    <h3 id="feel-card-title" class="feel-card-title">What helps you lift<PremiumMark v-if="!unlocked" /></h3>

    <template v-if="insights.tagged < MIN_TAGGED_WORKOUTS">
      <p class="feel-card-sub">
        Tag how {{ MIN_TAGGED_WORKOUTS }} workouts felt on the finish recap to compare your sleep, energy, and stress.
        {{ insights.tagged }} of {{ MIN_TAGGED_WORKOUTS }} so far.
      </p>
      <div class="meter" aria-hidden="true"><i :style="{ width: `${(insights.tagged / MIN_TAGGED_WORKOUTS) * 100}%` }"></i></div>
    </template>

    <template v-else-if="unlocked">
      <TrialNote feature="progress" />
      <ul v-if="insights.findings.length > 0" class="findings">
        <li v-for="finding in insights.findings" :key="finding.dimension" data-testid="feel-finding">
          <span class="finding-text">{{ finding.text }}</span>
          <span class="finding-detail">{{ finding.detail }}</span>
        </li>
      </ul>
      <p v-else class="feel-card-sub" data-testid="feel-no-pattern">
        No clear difference yet. Keep tagging and check back.
      </p>
      <p class="feel-card-foot">Based on {{ plural(insights.tagged, 'tagged workout') }}. Patterns, not proof.</p>
    </template>

    <template v-else>
      <p class="feel-card-sub">See how sleep, energy, and stress line up with your {{ plural(insights.tagged, 'tagged workout') }}.</p>
      <button v-if="!previewing" type="button" class="preview-button" @click="previewing = true">Preview</button>
      <div v-else class="preview">
        <ul class="findings sample" aria-hidden="true">
          <li v-for="sample in SAMPLE" :key="sample.text">
            <span class="finding-text">{{ sample.text }}</span>
            <span class="finding-detail">{{ sample.detail }}</span>
          </li>
        </ul>
        <div class="preview-overlay">
          <PremiumPreviewPanel
            feature="progress"
            title="What helps you lift is part of Premium"
            body="Tagging how a workout felt stays free, and so does your Workout log."
            @back="previewing = false"
          />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.feel-card {
  margin-bottom: 12px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.feel-card-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.15;
}

.feel-card-sub {
  margin: 4px 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.feel-card-foot {
  margin: 10px 0 0;
  font-size: 0.75rem;
  color: var(--text-dim);
}

.meter {
  height: 6px;
  margin-top: 10px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.meter i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
}

.findings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.findings li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 10px;
  border-left: 3px solid var(--accent);
}

.finding-text {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.35;
}

.finding-detail {
  font-size: 0.78rem;
  color: var(--text-dim);
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
