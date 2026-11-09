<script setup lang="ts">
// Issue #136 (Premium): where the five big barbell lifts stand for the
// user's body weight, Beginner to Elite, how far each is from the next level,
// and one overall score. Opt-in and encouraging: it needs a sex answer (asked
// once, here) and a weigh-in, and only ever talks about the next level.
// Without Premium it's a blurred sample under PremiumPreviewPanel, and the
// question isn't asked for a feature they can't use yet.
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { hasPremium } from '../lib/premium'
import { findLibraryMatch } from '../lib/exerciseLibrary'
import { bodyWeightAt } from '../lib/bodyStats'
import { dismissedLinks, pendingLinkSuggestions } from '../lib/libraryLink'
import type { LoadType } from '../lib/types'
import {
  STRENGTH_GROUPS,
  STRENGTH_LIFTS,
  STRENGTH_TIERS,
  bestOneRepMaxes,
  convertsOneSided,
  liftForExercise,
  overallStrength,
  rateLift,
  setStrengthSex,
  strengthSex,
  type LiftRating,
  type StrengthLift,
} from '../lib/strengthLevels'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'
import TrialNote from './TrialNote.vue'
import StrengthSexPicker from './StrengthSexPicker.vue'

const router = useRouter()
const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const bodyWeight = useBodyWeightStore()

// A Strength levels trial pass (#155) counts as Premium here.
const isPremium = computed(() => hasPremium('strength'))

onMounted(() => {
  workout.fetchProgressSets()
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
  if (!bodyWeight.fetched) bodyWeight.fetchEntries()
})

const ready = computed(() => workout.progressSetsFetched && exercises.fetched && bodyWeight.fetched)

const weighIn = computed(() => bodyWeight.latestEntry)
const unit = computed(() => weighIn.value?.weight_unit ?? 'lb')

// An "Assisted pull-up" typed by hand matches the library's assisted entry.
function matchName(name: string): string | null {
  return findLibraryMatch(name)?.id ?? null
}

const liftByExercise = computed(() => {
  const map = new Map<string, { lift: StrengthLift; loadType: LoadType; oneSided: boolean }>()
  for (const e of exercises.exercises) {
    const lift = liftForExercise(e, matchName)
    if (lift) map.set(e.id, { lift, loadType: e.load_type, oneSided: convertsOneSided(e, lift) })
  }
  return map
})

const ratings = computed<LiftRating[]>(() => {
  const sex = strengthSex.value
  const entry = weighIn.value
  if (!entry || (sex !== 'male' && sex !== 'female')) return []
  const best = bestOneRepMaxes(
    workout.progressSets,
    (id) => liftByExercise.value.get(id) ?? null,
    (at) => bodyWeightAt(bodyWeight.entries, at, entry.weight_unit),
    entry.weight_unit,
  )
  return STRENGTH_LIFTS.flatMap((lift) => {
    const found = best.get(lift.id)
    return found ? [rateLift(lift, found.oneRepMax, entry.weight, entry.weight_unit, sex, found.oneSided)] : []
  })
})

const overall = computed(() => overallStrength(ratings.value))

// Unlinked exercises that would get a level once linked (libraryLink.ts).
const linkCount = computed(
  () =>
    pendingLinkSuggestions(exercises.exercises, dismissedLinks.value).filter(
      (s) =>
        // Already counting by name (e.g. "Single Leg Press"): nothing to gain.
        !liftByExercise.value.has(s.exerciseId) &&
        liftForExercise({ library_id: s.entry.id, name: s.name, load_type: s.entry.loadType }, () => null),
    ).length,
)
const unratedGroups = computed(() =>
  STRENGTH_GROUPS.filter((g) => !ratings.value.some((r) => r.lift.group === g.id)).map((g) => g.label),
)

function sideWord(r: LiftRating): string {
  return r.lift.group === 'squat' ? 'one leg' : 'one arm'
}

function estimateLabel(r: LiftRating): string {
  if (r.oneSided) return r.lift.group === 'squat' ? 'est. two-leg 1RM' : 'est. two-arm 1RM'
  if (r.lift.equipment === 'dumbbell') return 'est. 1RM per dumbbell'
  if (r.lift.equipment === 'bodyweight') return 'est. 1RM with body weight'
  return 'est. 1RM'
}

// What shows where the levels would be.
const state = computed<'ask' | 'skipped' | 'no-weigh-in' | 'levels'>(() => {
  if (strengthSex.value === null) return 'ask'
  if (strengthSex.value === 'unspecified') return 'skipped'
  if (!weighIn.value) return 'no-weigh-in'
  return 'levels'
})

// The blurred sample free users see; never their own numbers.
const SAMPLE = [
  { name: 'Squat', tier: 'Intermediate', ratio: '1.6', next: '25 lb to Advanced' },
  { name: 'Bench press', tier: 'Novice', ratio: '0.9', next: '15 lb to Intermediate' },
  { name: 'Deadlift', tier: 'Intermediate', ratio: '1.9', next: '45 lb to Advanced' },
]

function round(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

function goBack() {
  router.push({ name: 'progress' })
}
</script>

<template>
  <div class="strength-levels">
    <router-link :to="{ name: 'progress' }" class="back-link" aria-label="Back to Progress"><span aria-hidden="true">‹</span>Progress</router-link>
    <PageHeader title="Strength levels" />
    <p class="page-lede">Your best est. 1RM on the big lifts, for your body weight.</p>

    <TrialNote feature="strength" class="strength-trial" />

    <SkeletonRows v-if="!ready" :rows="4" />

    <div v-else-if="!isPremium" class="preview">
      <div class="preview-content" inert aria-hidden="true">
        <div class="overall card">
          <span class="overall-label">Overall</span>
          <span class="overall-tier">Intermediate</span>
          <span class="overall-score">52<small>/100</small></span>
        </div>
        <ul class="lifts">
          <li v-for="s in SAMPLE" :key="s.name" class="lift card">
            <span class="lift-name">{{ s.name }}</span>
            <span class="tier-pill">{{ s.tier }}</span>
            <span class="lift-detail">{{ s.ratio }}× body weight · {{ s.next }}</span>
          </li>
        </ul>
      </div>
      <div class="preview-overlay">
        <PremiumPreviewPanel
          feature="strength"
          title="Strength levels are part of Premium"
          body="Lift progress and your records stay free."
          @back="goBack"
        />
      </div>
    </div>

    <section v-else-if="state === 'ask'" class="card ask" aria-labelledby="strength-ask-title">
      <h3 id="strength-ask-title">One question first</h3>
      <p class="ask-lede">Strength standards are published for male and female lifters. Which should RepBunny use for you?</p>
      <StrengthSexPicker />
    </section>

    <section v-else-if="state !== 'levels'" class="card prompt" data-testid="strength-prompt">
      <template v-if="state === 'skipped'">
        <h3>Levels are off for now</h3>
        <p>Strength levels need a set of standards to compare with, and those are split by sex. Answer whenever you like, here or in Preferences.</p>
        <button type="button" class="prompt-action" @click="setStrengthSex(null)">Answer now</button>
      </template>
      <template v-else>
        <h3>Log a weigh-in to see your levels</h3>
        <p>Levels compare each lift to your body weight, so they need one weigh-in to start.</p>
        <router-link :to="{ name: 'body' }" class="prompt-action">Log your weight</router-link>
      </template>
    </section>

    <template v-else>
      <router-link
        v-if="linkCount > 0"
        :to="{ name: 'library-link', query: { for: 'strength' } }"
        class="card link-card"
        data-testid="strength-link-card"
      >
        <span class="link-text">
          <b>{{ linkCount === 1 ? '1 of your exercises' : `${linkCount} of your exercises` }} might count here</b>
          <span>{{ linkCount === 1 ? 'It looks' : 'They look' }} like library lifts. Link them to get a level.</span>
        </span>
        <span class="link-action">Review ›</span>
      </router-link>

      <div v-if="overall" class="overall card" data-testid="strength-overall">
        <span class="overall-label">Overall</span>
        <span class="overall-tier" data-testid="strength-overall-tier">{{ overall.tier }}</span>
        <span class="overall-score" data-testid="strength-overall-score">{{ overall.score }}<small>/100</small></span>
        <span class="overall-note">
          Your best lift in each movement, averaged, from Beginner (0) to Elite (100).
        </span>
      </div>
      <p v-else class="card empty" data-testid="strength-empty">
        Log a squat, bench, deadlift, overhead press, row, or pull-up (barbell, dumbbell, machine, or bodyweight)
        to see where it stands.
      </p>

      <ul v-if="ratings.length" class="lifts" aria-label="Lifts">
        <li v-for="r in ratings" :key="r.lift.id" class="lift card" :data-testid="`strength-lift-${r.lift.id}`">
          <span class="lift-name">{{ r.lift.name }}</span>
          <span class="tier-pill" data-testid="strength-tier">{{ STRENGTH_TIERS[r.tier] }}</span>
          <span class="lift-detail">
            {{ round(r.oneRepMax) }} {{ unit }} {{ estimateLabel(r) }} · {{ r.ratio.toFixed(2) }}× body weight
          </span>
          <span v-if="r.oneSided" class="lift-note" data-testid="strength-one-sided">
            From your {{ sideWord(r).replace(' ', '-') }} sets: one side moves about 55% of what both do together.
          </span>
          <span v-if="r.lift.equipment === 'machine'" class="lift-note">Machines vary, so compare this one with yourself.</span>
          <span class="lift-next" data-testid="strength-next">
            <template v-if="r.next">
              {{ round(r.next.weightToGo) }} {{ unit }}{{ r.oneSided ? ` on ${sideWord(r)}` : '' }} to {{ r.next.tier }}
            </template>
            <template v-else>Top of the table. Nice work.</template>
          </span>
        </li>
      </ul>

      <p v-if="unratedGroups.length && ratings.length" class="unrated" data-testid="strength-unrated">
        Nothing rated yet for {{ unratedGroups.join(', ') }}.
      </p>

      <p class="footnote">
        Uses your latest weigh-in ({{ weighIn!.weight }} {{ weighIn!.weight_unit }}) and RepBunny's standards for
        {{ strengthSex === 'female' ? 'female' : 'male' }} lifters. Change this in Preferences.
      </p>
    </template>
  </div>
</template>

<style scoped>
.strength-trial {
  margin-bottom: 12px;
}

.page-header {
  margin-bottom: 2px;
}

.page-lede {
  margin: 0 0 14px;
  color: var(--text-dim);
  font-size: 0.82rem;
  line-height: 1.4;
}

.card {
  margin-bottom: 12px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.card h3 {
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
}

.ask-lede,
.prompt p {
  margin: 0 0 10px;
  font-size: 0.86rem;
  line-height: 1.45;
}

.prompt-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  background: var(--accent);
  border: 1px solid var(--accent);
  color: var(--accent-text);
  font-weight: 800;
  text-decoration: none;
}

.link-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border-style: dashed;
  border-color: color-mix(in srgb, var(--secondary) 70%, transparent);
  background: color-mix(in srgb, var(--secondary) 8%, var(--surface));
  color: var(--text);
  text-decoration: none;
}

.link-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.link-text b {
  font-size: 0.9rem;
  color: var(--text);
}

.link-action {
  flex-shrink: 0;
  font-weight: 800;
  font-size: 0.86rem;
  color: var(--secondary);
}

.overall {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 2px 12px;
  background: color-mix(in srgb, var(--accent) 9%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.overall-label {
  grid-column: 1 / -1;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.overall-tier {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
}

.overall-score {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent);
}

.overall-score small {
  font-size: 0.85rem;
  color: var(--text-dim);
}

.overall-note {
  grid-column: 1 / -1;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.empty {
  color: var(--text-dim);
  font-size: 0.88rem;
}

.lifts {
  margin: 0;
  padding: 0;
  list-style: none;
}

.lift {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 10px;
  align-items: center;
}

.lift-name {
  font-weight: 800;
  overflow-wrap: anywhere;
}

.tier-pill {
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  color: var(--secondary);
  font-size: 0.74rem;
  font-weight: 800;
}

.lift-detail,
.lift-next {
  grid-column: 1 / -1;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.lift-note {
  grid-column: 1 / -1;
  font-size: 0.74rem;
  font-style: italic;
  color: var(--text-dim);
}

.lift-next {
  font-weight: 800;
  color: var(--accent);
}

.unrated,
.footnote {
  margin: 0 0 10px;
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.preview {
  position: relative;
  min-height: 420px;
}

.preview-content {
  filter: blur(6px);
  opacity: 0.7;
  user-select: none;
  pointer-events: none;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 72px;
}
</style>
