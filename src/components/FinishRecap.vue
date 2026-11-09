<script setup lang="ts">
import type { FinishRecap } from '../lib/finishRecap'
import { computed, watch } from 'vue'
import { TRIAL_PASS_TIERS, currentTrial, openTrialSheet, unusedPassCount } from '../lib/trialPass'
import { chartTeaser, isPremium, showPremiumNudges } from '../lib/premium'
import { tierHeadline, tierRewardLabel, type FinishMilestones } from '../lib/milestones'
import { readRecentLines, recapLine, rememberLine } from '../lib/extras'
import type { RecapFacts } from '../lib/bunnyLines'
import type { WorkoutFeel } from '../lib/workoutFeel'
import AutoCopyPrompt from './AutoCopyPrompt.vue'
import FirstWorkoutCelebration from './FirstWorkoutCelebration.vue'
import PremiumChartTeaser from './PremiumChartTeaser.vue'
import RecapRatingAsk from './RecapRatingAsk.vue'
import WorkoutFeelPicker from './WorkoutFeelPicker.vue'

// Backlog item 106: post-finish session recap. Everything shown is computed
// by lib/finishRecap.ts; this component only lays it out, following the
// "A1 · Session recap" / "A2 · cardio and core day" artboards on the design
// canvas linked from docs/backlog-archive.md's item 106 entry.
// Issue #153: milestone tiers this workout crossed, and the one-time note
// for history that predates milestones, or (#188) the next-unlock line when
// neither is there. Null when there's nothing to show.
const props = defineProps<{
  recap: FinishRecap
  canResume: boolean
  milestones?: FinishMilestones | null
  // Issue #156: swapped-in exercise id to the name of the one it replaced.
  swappedFor?: Record<string, string>
  // Issue #149: the workout's "How did it feel?" tags; null hides the card
  // (a build that can't store them).
  feel?: WorkoutFeel | null
}>()

// Issue #155: this workout earned a trial pass, so offer to start one now
// (or later, from Milestones). Hidden once it's started.
const offerTrial = computed(
  () =>
    showPremiumNudges.value &&
    !currentTrial.value &&
    unusedPassCount.value > 0 &&
    // The first-run note can carry passes the earlier history earned.
    (!!props.milestones?.intro || !!props.milestones?.tiers.some((t) => TRIAL_PASS_TIERS.includes(t.id))),
)

// Issue #183: the bunny's line about this workout (records, exercises up on
// last time, workouts this week), in the picked personality's voice. Its
// random draws and the recent lines it skips are fixed at mount, so it only
// changes when a fact does: a feel tag picked below can turn a lighter day's
// kind line into one that names it.
const draws = Array.from({ length: 4 }, () => Math.random())
const recentAtMount = readRecentLines()
const bunnyLine = computed(() => {
  let i = 0
  const facts: RecapFacts = {
    records: props.recap.records,
    upCount: props.recap.comparisons.filter((c) => c.tone === 'up').length,
    lighterCount: props.recap.comparisons.filter((c) => c.chip === 'Lighter').length,
    weekWorkouts: props.recap.week.workouts,
    feel: props.feel,
  }
  return recapLine(facts, { rand: () => draws[i++ % draws.length], recent: recentAtMount })
})
watch(bunnyLine, rememberLine, { immediate: true })

function swapLabel(exerciseId: string): string {
  const original = props.swappedFor?.[exerciseId]
  return original ? ` (swapped in for ${original})` : ''
}
// Issue #46: tapping a record or comparison row opens that exercise's
// history sheet (with its progress chart) over the recap.
defineEmits<{ done: []; resume: []; 'open-history': [exerciseId: string]; feel: [patch: Partial<WorkoutFeel>] }>()
// Item 111: workout notes moved here from the start screen, since how a
// session went is only known afterward. The parent saves it on Done/Resume.
const notes = defineModel<string>('notes', { default: '' })

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function dayLabel(index: number, kind: string | null, todayIndex: number): string {
  const what = kind === 'strength' ? 'strength workout' : kind === 'timed' ? 'timed workout' : 'no workout'
  return `${WEEKDAY_NAMES[index]}: ${what}${index === todayIndex ? ' (today)' : ''}`
}
</script>
<template>
  <div class="recap">
    <RecapRatingAsk :recap="recap" />
    <FirstWorkoutCelebration v-if="recap.firstTemplateRun" :routine="recap.firstRunRoutine" />
    <header class="recap-header">
      <p class="recap-eyebrow">Workout saved</p>
      <h3 class="recap-title">{{ recap.title }}</h3>
      <p class="recap-meta">{{ recap.meta }}</p>
      <p v-if="bunnyLine" class="recap-line" data-testid="recap-bunny-line">{{ bunnyLine }}</p>
    </header>

    <!-- Issue #207: the logger's save-as-template offer. -->
    <slot name="after-header" />

    <!-- Issue #432: a note when the automatic copy failed to save (#874). -->
    <AutoCopyPrompt />

    <section v-if="milestones && (milestones.tiers.length > 0 || milestones.intro)" class="recap-card recap-milestones" data-testid="recap-milestones">
      <div class="milestones-heading">
        <span class="carrot-pop" aria-hidden="true" />
        <h4>
          {{
            milestones.tiers.length === 0
              ? 'Milestones are here'
              : milestones.tiers.length === 1
                ? 'Milestone unlocked'
                : `${milestones.tiers.length} milestones unlocked`
          }}
        </h4>
      </div>
      <ul v-if="milestones.tiers.length > 0" class="milestone-list">
        <li v-for="tier in milestones.tiers" :key="tier.id" data-testid="recap-milestone">
          <span class="milestone-name">{{ tierHeadline(tier) }}</span>
          <span v-if="tierRewardLabel(tier, isPremium)" class="row-detail">Unlocked: {{ tierRewardLabel(tier, isPremium) }}</span>
        </li>
      </ul>
      <button v-if="offerTrial" type="button" class="trial-pick" @click="openTrialSheet">Pick a Premium feature to try</button>
      <p v-if="milestones.intro" class="milestone-intro" data-testid="recap-milestones-intro">{{ milestones.intro }}</p>
      <router-link :to="{ name: 'milestones' }" class="milestones-link">See all milestones</router-link>
    </section>
    <router-link v-else-if="milestones?.next" :to="{ name: 'milestones' }" class="next-unlock" data-testid="recap-next-unlock">
      <span class="next-unlock-carrot" aria-hidden="true" />
      <span>{{ milestones.next }}</span>
    </router-link>

    <div class="recap-tiles">
      <section v-if="recap.hero?.kind === 'volume'" class="recap-tile recap-hero" data-testid="recap-hero">
        <h4 class="tile-label">Volume moved</h4>
        <div class="hero-value-row">
          <span class="hero-value hero-value-volume">{{ recap.hero.value }}</span>
          <span class="hero-unit">{{ recap.hero.unit }}</span>
        </div>
        <p v-if="recap.hero.delta" class="hero-delta">
          <span class="chip" :class="`chip-${recap.hero.delta.tone}`" data-testid="recap-volume-delta">
            <svg v-if="recap.hero.delta.tone === 'up'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            {{ recap.hero.delta.label }}
          </span>
          <span>{{ recap.hero.delta.caption }}</span>
        </p>
        <template v-if="recap.hero.bars.length > 0">
          <ol class="hero-bars" :aria-label="`Volume, last ${recap.hero.bars.length} sessions`">
            <li
              v-for="(bar, i) in recap.hero.bars"
              :key="i"
              class="hero-bar"
              :class="{ 'hero-bar-today': bar.isToday }"
              :style="{ height: `${bar.heightPct}%` }"
              data-testid="recap-volume-bar"
            >
              <span class="sr-only">{{ bar.isToday ? 'Today' : 'Earlier session' }}: {{ bar.label }}</span>
            </li>
          </ol>
          <div class="hero-bars-axis" aria-hidden="true">
            <span>{{ recap.hero.bars.length - 1 }} session{{ recap.hero.bars.length === 2 ? '' : 's' }} ago</span>
            <span>Today</span>
          </div>
        </template>
      </section>

      <section v-else-if="recap.hero?.kind === 'time'" class="recap-tile recap-hero" data-testid="recap-hero">
        <h4 class="tile-label">Time moving</h4>
        <div class="hero-value-row">
          <span class="hero-value hero-value-time">{{ recap.hero.value }}</span>
          <span v-if="recap.hero.unit" class="hero-unit">{{ recap.hero.unit }}</span>
        </div>
        <div class="time-split" aria-hidden="true">
          <span
            v-for="segment in recap.hero.segments"
            :key="segment.name"
            class="time-split-segment"
            :style="{ width: `${segment.pct}%`, background: segment.color }"
          />
        </div>
        <ul class="time-legend">
          <li v-for="segment in recap.hero.segments" :key="segment.name">
            <span class="legend-dot" :style="{ background: segment.color }" aria-hidden="true" />
            {{ segment.name }} {{ segment.label }}
          </li>
        </ul>
      </section>

      <section v-for="tile in recap.tiles" :key="tile.label" class="recap-tile" data-testid="recap-tile">
        <h4 class="tile-label">{{ tile.label }}</h4>
        <div class="tile-value">{{ tile.value }}<span v-if="tile.unit" class="tile-unit">{{ ` ${tile.unit}` }}</span></div>
        <p v-if="tile.sub" class="tile-sub">{{ tile.sub }}</p>
      </section>
    </div>

    <section v-if="recap.records.length > 0" class="recap-card recap-records" data-testid="recap-records">
      <div class="records-heading">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>
        <h4>{{ recap.records.length === 1 ? 'New record' : `${recap.records.length} new records` }}</h4>
      </div>
      <ul class="recap-list">
        <li v-for="(record, i) in recap.records" :key="i" class="record-item" data-testid="recap-record">
          <button
            type="button"
            class="row-button record-row"
            :aria-label="`${record.exerciseName}${swapLabel(record.exerciseId)} progress:${record.value}, ${record.detail}${record.e1rmGain ? `, est. 1RM up ${record.e1rmGain}` : ''}`"
            @click="$emit('open-history', record.exerciseId)"
          >
            <span class="record-text">
              <span class="row-name">{{ record.exerciseName }}</span>
              <span v-if="swappedFor?.[record.exerciseId]" class="row-detail" data-testid="recap-swap-note">swapped in for {{ swappedFor[record.exerciseId] }}</span>
              <span class="row-detail">{{ record.detail }}</span>
              <span v-if="record.e1rmGain" class="chip chip-up e1rm-chip" data-testid="recap-e1rm-gain">est. 1RM ▲ {{ record.e1rmGain }}</span>
            </span>
            <span class="record-value">{{ record.value }}</span>
            <svg class="row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="recap.comparisons.length > 0" class="recap-card" data-testid="recap-comparisons">
      <h4 class="section-label">{{ recap.comparisons.every(row => row.tone === 'new') ? 'All new today' : 'Vs last time' }}</h4>
      <ul class="recap-list">
        <li v-for="(row, i) in recap.comparisons" :key="i" data-testid="recap-comparison">
          <button
            type="button"
            class="row-button compare-row"
            :aria-label="`${row.exerciseName}${swapLabel(row.exerciseId)} progress: ${row.today}, ${row.chip}`"
            @click="$emit('open-history', row.exerciseId)"
          >
            <span class="compare-name">
              <span class="row-name">{{ row.exerciseName }}</span>
              <span v-if="swappedFor?.[row.exerciseId]" class="row-detail" data-testid="recap-swap-note">swapped in for {{ swappedFor[row.exerciseId] }}</span>
            </span>
            <span class="compare-right">
              <span class="row-detail">{{ row.today }}</span>
              <span class="chip" :class="`chip-${row.tone}`">
                <svg v-if="row.tone === 'new'" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1 L14.4 9.6 L23 12 L14.4 14.4 L12 23 L9.6 14.4 L1 12 L9.6 9.6 Z" /></svg>
                {{ row.chip }}
              </span>
            </span>
            <svg class="row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </li>
      </ul>
    </section>

    <PremiumChartTeaser v-if="chartTeaser" :teaser="chartTeaser" />

    <section class="recap-card" data-testid="recap-week">
      <div class="week-heading">
        <h4 class="section-label">This week</h4>
        <span class="row-detail">Sun to Sat</span>
      </div>
      <ol class="week-days">
        <li v-for="(kind, i) in recap.week.days" :key="i" class="week-day" :aria-label="dayLabel(i, kind, recap.week.todayIndex)">
          <span
            class="week-dot"
            :class="{ 'week-dot-strength': kind === 'strength', 'week-dot-timed': kind === 'timed', 'week-dot-today': i === recap.week.todayIndex }"
            aria-hidden="true"
          />
          <span aria-hidden="true">{{ WEEKDAY_LETTERS[i] }}</span>
        </li>
      </ol>
      <div class="week-stats">
        <div class="week-stat" data-testid="recap-week-workouts">
          <span class="week-stat-value">{{ recap.week.workouts }}</span>
          <span class="row-detail">{{ recap.week.workouts === 1 ? 'workout' : 'workouts' }}</span>
        </div>
        <div class="week-stat">
          <span class="week-stat-value">{{ recap.week.volume }}</span>
          <span class="row-detail">{{ recap.week.volumeUnit }} moved</span>
        </div>
        <div class="week-stat">
          <span class="week-stat-value">{{ recap.week.cardioMinutes }} min</span>
          <span class="row-detail">cardio</span>
        </div>
      </div>
    </section>

    <section v-if="feel" class="recap-card" data-testid="recap-feel">
      <div class="week-heading">
        <h4 class="section-label">How did it feel?</h4>
        <span class="row-detail">Optional</span>
      </div>
      <WorkoutFeelPicker :feel="feel" @change="$emit('feel', $event)" />
    </section>

    <div class="recap-notes">
      <label for="recap-notes">Notes (optional)</label>
      <textarea id="recap-notes" v-model="notes" rows="2" :placeholder="feel ? 'Anything to remember?' : 'How did it feel?'" />
    </div>

    <div class="recap-actions">
      <button type="button" class="btn-accent recap-done" @click="$emit('done')">Done</button>
      <button v-if="canResume" type="button" class="recap-resume" @click="$emit('resume')">Finished too early? Resume</button>
    </div>
  </div>
</template>

<style scoped>
.recap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.recap-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 4px;
}

.recap-eyebrow {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--success);
}

.recap-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.recap-meta {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-dim);
}

.recap-line {
  margin: 6px 0 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--accent);
  overflow-wrap: anywhere;
}

/* Two columns, or one once a tile can't get 6em (issue #492: at a large
   Android font size the Time tile broke "0:04" in two). */
.recap-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(max(min(100%, 6em), calc((100% - 10px) / 2)), 1fr));
  gap: 10px;
}

.recap-tile,
.recap-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 16px;
  min-width: 0;
}

.recap-hero {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tile-label {
  margin: 0;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
}

.hero-value-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.hero-value {
  font-family: var(--font-display);
  font-size: 2.9rem;
  font-weight: 700;
  line-height: 1;
}

.hero-value-volume {
  color: var(--accent);
}

.hero-value-time {
  color: var(--secondary);
}

.hero-unit {
  font-size: 1.05rem;
  font-weight: 600;
}

.hero-delta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-dim);
}

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 58px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.chip-up {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}

.chip-new {
  background: color-mix(in srgb, var(--highlight) 14%, transparent);
  color: var(--highlight);
}

.chip-new svg {
  flex-shrink: 0;
}

.chip-neutral {
  background: var(--surface-2);
  color: var(--text-dim);
  border: 1px solid var(--border);
}

.hero-bars {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 44px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.hero-bar {
  position: relative;
  flex: 1 1 0;
  background: var(--border);
  border-radius: 6px;
}

.hero-bar-today {
  background: var(--accent);
}

.hero-bars-axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-dim);
}

.time-split {
  display: flex;
  gap: 3px;
  height: 12px;
  margin-top: 8px;
  border-radius: 999px;
  overflow: hidden;
}

.time-split-segment {
  display: block;
  min-width: 4px;
}

.time-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.time-legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.tile-value {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
  overflow-wrap: break-word;
}

.tile-unit {
  font-size: 1.1rem;
}

.tile-sub {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.recap-records {
  border-color: color-mix(in srgb, var(--highlight) 35%, transparent);
}

.records-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--highlight);
}

.records-heading h4,
.milestones-heading h4 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
}

.recap-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Issue #46: full-row tap targets that keep the plain row look. */
.row-button {
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  text-align: left;
  cursor: pointer;
}

.row-chevron {
  flex-shrink: 0;
  align-self: center;
  color: var(--text-dim);
}

.record-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.record-item + .record-item {
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.record-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1 1 auto;
  min-width: 0;
}

.e1rm-chip {
  min-width: 0;
  margin-top: 4px;
}

.row-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.row-detail {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.record-value {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}

.section-label {
  margin: 0 0 10px;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.compare-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compare-name {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
}

.compare-right {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}

.compare-right .row-detail {
  font-size: 0.875rem;
}

.week-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.week-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-dim);
}

.week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.week-dot {
  width: 30px;
  max-width: 100%;
  aspect-ratio: 1;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.week-dot-strength {
  background: var(--accent);
  border-color: var(--accent);
}

.week-dot-timed {
  background: var(--secondary);
  border-color: var(--secondary);
}

.week-dot-today {
  border: 2px solid var(--text);
}

/* Three across, wrapping once a stat can't get 4.5em (issue #492: at a large
   Android font size the numbers broke mid-number). */
.week-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 4.5em), 1fr));
  gap: 8px;
}

.week-stat {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.week-stat-value {
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  overflow-wrap: break-word;
}

.recap-notes {
  display: flex;
  flex-direction: column;
}

.recap-notes textarea {
  resize: vertical;
}

.recap-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.recap-done {
  width: 100%;
  min-height: 56px;
  font-size: 1.1rem;
}

.recap-resume {
  min-height: 44px;
  padding: 0 12px;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
}

/* Issue #153: the carrot is the milestone motif (drawn in code, the same
   one Carrot Patch uses); it pops in once, never loops. */
.recap-milestones {
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}

.milestones-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent);
}

.carrot-pop {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  background: var(--decor-carrot) no-repeat center / contain;
  animation: carrot-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes carrot-pop {
  0% {
    transform: scale(0) rotate(-40deg);
  }
  60% {
    transform: scale(1.25) rotate(8deg);
  }
  100% {
    transform: scale(1) rotate(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .carrot-pop {
    animation: none;
  }
}

.milestone-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.milestone-list li {
  display: flex;
  flex-direction: column;
}

.milestone-name {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.milestone-intro {
  margin: 10px 0 0;
  font-size: 0.9rem;
  color: var(--text-dim);
}

.trial-pick {
  width: 100%;
  min-height: 44px;
  margin-top: 12px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.milestones-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-top: 4px;
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}

/* Issue #188: one quiet line when the next unlock is close. */
.next-unlock {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 4px;
  color: var(--accent);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.next-unlock-carrot {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  background: var(--decor-carrot) no-repeat center / contain;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
