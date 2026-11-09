<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDay, formatWeight, type RepRecords } from '../lib/repRecords'
import type { SmartTarget } from '../lib/smartTarget'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'

// A weight exercise's "Next time" double-progression target and its best
// reps at each weight, under the progress chart in ExerciseHistoryDetail.vue.
// Design: docs/design/issue-45-rep-records.html.
// Issue #132: the best-reps table is Premium (Next time stays free). Locked,
// it's a card that opens a blurred preview with Keep it with Premium / Go
// back.
// Issue #140: with Premium, `smart` replaces the target with the RPE-aware
// one and its reasoning moves under a "Why this?" expander.
// Issue #141: a stalled lift can offer a lighter week here too.
const props = defineProps<{ data: RepRecords; locked?: boolean; smart?: SmartTarget | null }>()
const emit = defineEmits<{ 'lighter-week': [accepted: boolean] }>()

const VISIBLE_ROWS = 6
const showAll = ref(false)
const previewing = ref(false)
const whyOpen = ref(false)

const next = computed(() => {
  const s = props.smart
  if (s) return { weight: s.weight, reps: s.reps, goUp: s.goUp, best: s.best }
  return props.data.next
})

const rangeReps = computed(() => {
  const { min, max } = props.data.range
  return Array.from({ length: max - min + 1 }, (_, i) => min + i)
})

const rows = computed(() => (showAll.value ? props.data.records : props.data.records.slice(0, VISIBLE_ROWS)))
const maxReps = computed(() => Math.max(...props.data.records.map((r) => r.reps)))
</script>

<template>
  <section v-if="next && data.next" class="rr-card next-card" aria-labelledby="next-time-title">
    <h3 id="next-time-title" class="kicker">Next time</h3>
    <div class="next" :class="{ up: next.goUp }">
      <div class="next-icon" aria-hidden="true">
        <svg v-if="next.goUp" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 14 12 8 18 14" />
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      </div>
      <div class="next-body">
        <p class="goal">
          <template v-if="next.goUp">Go up: </template>{{ formatWeight(next.weight) }} {{ smart?.unit ?? data.unit }} × <em>{{ next.reps }}</em>
        </p>
        <p class="why">{{ smart ? smart.summary : data.next.why }}</p>
        <button
          v-if="smart"
          type="button"
          class="why-toggle"
          :aria-expanded="whyOpen"
          aria-controls="next-time-why"
          @click="whyOpen = !whyOpen"
        >
          Why this?
        </button>
      </div>
    </div>
    <div v-if="smart && whyOpen" id="next-time-why" class="why-body">
      <p v-for="line in smart.why" :key="line" class="why">{{ line }}</p>
    </div>
    <div v-if="smart?.stall === 'offer' && smart.lighter" class="lighter-offer" role="group" aria-label="Lighter week">
      <p class="why">
        <strong>Lighter week?</strong> About 10% off for one session
        (<span class="nowrap">{{ formatWeight(smart.lighter.weight) }} {{ smart.unit }} × {{ smart.lighter.reps }}</span>), then build back.
      </p>
      <div class="lighter-actions">
        <button type="button" class="lighter-take" @click="emit('lighter-week', true)">Take a lighter week</button>
        <button type="button" class="why-toggle" @click="emit('lighter-week', false)">Not now</button>
      </div>
    </div>
    <div class="range" aria-hidden="true">
      <span
        v-for="n in rangeReps"
        :key="n"
        :class="{ done: n <= next.best, target: n === next.reps && n > next.best }"
      >{{ n }}</span>
    </div>
    <p class="range-cap">Rep range {{ data.range.min }} to {{ data.range.max }}</p>
  </section>

  <button v-if="locked && !previewing" type="button" class="rr-card rr-locked" @click="previewing = true">
    <span class="rr-locked-text">
      <span class="rr-locked-title">Best reps at each weight</span>
      <span class="rr-sub">The most reps you've done at each weight.</span>
    </span>
    <span class="premium-tag">Premium</span>
  </button>

  <section v-else class="rr-card" aria-labelledby="best-reps-title">
    <div class="rr-head">
      <h3 id="best-reps-title">Best reps at each weight</h3>
      <span>{{ data.unit }}</span>
    </div>
    <p class="rr-sub">The most reps you've done at each weight. Beat it for a rep PR.</p>
    <div class="rr-body" :class="{ previewing: locked }">
      <table :class="{ blurred: locked }" :inert="locked" :aria-hidden="locked || undefined">
        <thead>
          <tr>
            <th scope="col">Weight</th>
            <th scope="col">Reps</th>
            <th aria-hidden="true"></th>
            <th scope="col" class="r">When</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.weight">
            <th scope="row" class="w">
              {{ formatWeight(r.weight) }}
              <span v-if="r.weight === data.lastWeight" class="last-tag">Last</span>
            </th>
            <td class="reps">{{ r.reps }}</td>
            <td class="bar" aria-hidden="true"><i :style="{ width: `${(r.reps / maxReps) * 100}%` }"></i></td>
            <td class="r date">{{ formatDay(r.performedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="locked" class="rr-overlay">
        <PremiumPreviewPanel
          feature="progress"
          title="Best reps at each weight is part of Premium"
          body="Your Next time target stays free."
          @back="previewing = false"
        />
      </div>
    </div>
    <button v-if="!locked && data.records.length > VISIBLE_ROWS" type="button" class="more" @click="showAll = !showAll">
      {{ showAll ? 'Show fewer' : `Show all ${data.records.length} weights` }}
    </button>
  </section>
</template>

<style scoped>
.rr-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 14px 12px;
  margin-bottom: 20px;
}

.rr-locked {
  width: 100%;
  min-height: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  color: var(--text);
  font-weight: normal;
}

.rr-locked-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rr-locked-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
}

.rr-locked .rr-sub {
  margin: 0;
}

.premium-tag {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 16%, transparent);
  color: var(--secondary);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.rr-body {
  position: relative;
}

/* Room for the preview card over a short table. */
.rr-body.previewing {
  min-height: 190px;
}

table.blurred {
  filter: blur(5px);
  opacity: 0.7;
  user-select: none;
  pointer-events: none;
}

.rr-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 8px 0;
}

.kicker {
  margin: 0 0 8px;
  font-family: inherit;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.next {
  display: flex;
  gap: 12px;
  align-items: center;
}

.next-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}

.next.up .next-icon {
  background: color-mix(in srgb, var(--success) 18%, transparent);
  color: var(--success);
}

.next-body {
  flex: 1;
  min-width: 0;
}

.goal {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.15;
}

.goal em {
  font-style: normal;
  color: var(--accent);
}

.next.up .goal em {
  color: var(--success);
}

.why {
  margin: 2px 0 0;
  font-size: 0.74rem;
  color: var(--text-dim);
  line-height: 1.4;
}

.why-toggle {
  min-height: 32px;
  margin-top: 4px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 0.74rem;
  font-weight: 700;
}

.why-body {
  margin-top: 8px;
}

.lighter-offer {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.lighter-offer strong {
  color: var(--text);
}

.nowrap {
  white-space: nowrap;
}

.lighter-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.lighter-actions .why-toggle {
  margin-top: 0;
}

.lighter-take {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.74rem;
  font-weight: 700;
}

.why-body .why {
  margin: 4px 0 0;
}

.range {
  display: flex;
  gap: 3px;
  margin-top: 10px;
}

.range span {
  flex: 1;
  min-width: 0;
  height: 22px;
  border-radius: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 0.66rem;
  font-weight: 800;
  color: var(--text-dim);
  display: grid;
  place-items: center;
}

.range span.done {
  background: color-mix(in srgb, var(--accent) 30%, var(--surface-2));
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  color: var(--text);
}

.next-card:has(.next.up) .range span.done {
  background: color-mix(in srgb, var(--success) 30%, var(--surface-2));
  border-color: color-mix(in srgb, var(--success) 50%, var(--border));
}

.range span.target {
  border: 1.5px dashed var(--accent);
  color: var(--accent);
}

.range-cap {
  margin: 4px 0 0;
  font-size: 0.64rem;
  font-weight: 700;
  color: var(--text-dim);
}

.rr-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 2px;
}

.rr-head h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
}

.rr-head span {
  font-size: 0.72rem;
  color: var(--text-dim);
  font-weight: 700;
}

.rr-sub {
  font-size: 0.74rem;
  color: var(--text-dim);
  margin: 0 0 10px;
  line-height: 1.4;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

thead th {
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
  text-align: left;
  padding: 0 0 6px;
}

thead th.r,
.r {
  text-align: right;
}

tbody th,
tbody td {
  height: 34px;
  padding: 0;
  border-top: 1px solid var(--border);
  vertical-align: middle;
  white-space: nowrap;
}

.w {
  font-weight: 800;
  width: 96px;
  text-align: left;
}

.last-tag {
  margin-left: 6px;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--secondary);
  border: 1px solid color-mix(in srgb, var(--secondary) 50%, transparent);
  border-radius: 999px;
  padding: 1px 5px;
  vertical-align: 1px;
}

.reps {
  width: 44px;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--accent);
}

.bar {
  padding: 0 10px 0 2px;
}

.bar i {
  display: block;
  height: 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 55%, transparent);
}

.date {
  color: var(--text-dim);
  font-size: 0.74rem;
  width: 52px;
}

.more {
  display: block;
  width: 100%;
  min-height: auto;
  margin-top: 8px;
  padding: 8px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 0.76rem;
  font-weight: 700;
}
</style>
