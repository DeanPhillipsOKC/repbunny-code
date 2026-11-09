<script setup lang="ts">
import { computed } from 'vue'
import type { ChartTeaser } from '../lib/finishRecap'
import { dismissChartTeaser, openPremiumSheet } from '../lib/premium'

// Issue #115: the one-time card on the finish recap once a lift has been
// logged in 5 workouts: that lift's real est. 1RM line, blurred, with the
// pitch below it (docs/design/issue-115-premium-teaser.html, option A).
// lib/premium.ts claimChartTeaser decides whether it shows.
const props = defineProps<{ teaser: ChartTeaser }>()

const WIDTH = 343
const HEIGHT = 130
const PAD_X = 18
const PAD_TOP = 22
const PAD_BOTTOM = 14

const points = computed(() => {
  const values = props.teaser.e1rm
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = (WIDTH - PAD_X * 2) / Math.max(1, values.length - 1)
  return values.map((v, i) => ({
    x: PAD_X + i * step,
    y: max === min ? HEIGHT / 2 : PAD_TOP + (1 - (v - min) / span) * (HEIGHT - PAD_TOP - PAD_BOTTOM),
  }))
})

const line = computed(() => points.value.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '))
const area = computed(() => {
  const pts = points.value
  return `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')} L${pts[pts.length - 1].x.toFixed(1)} ${HEIGHT} L${pts[0].x.toFixed(1)} ${HEIGHT} Z`
})
</script>

<template>
  <section class="chart-teaser" role="group" aria-label="Est. 1RM preview" data-testid="recap-chart-teaser">
    <div class="teaser-axis" aria-hidden="true">
      <span>Est. 1RM</span>
      <span>All</span>
    </div>
    <svg class="teaser-chart" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" aria-hidden="true">
      <g class="teaser-grid">
        <line x1="0" :y1="HEIGHT * 0.25" :x2="WIDTH" :y2="HEIGHT * 0.25" />
        <line x1="0" :y1="HEIGHT * 0.55" :x2="WIDTH" :y2="HEIGHT * 0.55" />
        <line x1="0" :y1="HEIGHT * 0.85" :x2="WIDTH" :y2="HEIGHT * 0.85" />
      </g>
      <path class="teaser-area" :d="area" />
      <polyline class="teaser-line" :points="line" />
      <circle v-for="(p, i) in points" :key="i" class="teaser-dot" :cx="p.x" :cy="p.y" :r="i === points.length - 1 ? 5 : 4" />
    </svg>
    <div class="teaser-body">
      <span class="eyebrow">Premium</span>
      <h4 class="teaser-title">You've logged {{ teaser.exerciseName }} {{ teaser.workoutCount }} times</h4>
      <p class="teaser-text">Premium shows its est. 1RM trend, volume, and all-time chart. This one's yours.</p>
      <div class="teaser-actions">
        <button type="button" class="see-premium" @click="openPremiumSheet('progress')">See Premium</button>
        <button type="button" class="not-now" @click="dismissChartTeaser">Not now</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chart-teaser {
  position: relative;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--secondary) 35%, var(--border));
  border-radius: 20px;
}

.teaser-axis {
  display: flex;
  justify-content: space-between;
  padding: 12px 14px 0;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.teaser-chart {
  display: block;
  width: 100%;
  height: 130px;
  color: var(--secondary);
  filter: blur(5px);
  opacity: 0.75;
}

.teaser-grid line {
  stroke: var(--border);
  stroke-width: 1;
}

.teaser-area {
  fill: currentColor;
  opacity: 0.18;
}

.teaser-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 3;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.teaser-dot {
  fill: currentColor;
}

.teaser-body {
  position: relative;
  margin-top: -26px;
  padding: 22px 14px 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  background: linear-gradient(to bottom, transparent 0, var(--surface) 26px);
}

.eyebrow {
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 16%, transparent);
  color: var(--secondary);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.teaser-title {
  margin: 4px 0 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text);
  overflow-wrap: anywhere;
}

.teaser-text {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.teaser-actions {
  align-self: stretch;
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.see-premium {
  flex: 1;
  min-height: 42px;
  padding: 0 10px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-size: 0.86rem;
  font-weight: 800;
}

.see-premium:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.not-now {
  min-height: 42px;
  padding: 0 14px;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
  font-size: 0.86rem;
  font-weight: 700;
}
</style>
