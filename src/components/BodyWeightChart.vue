<script setup lang="ts">
// Backlog item 77: body-weight-over-time chart on the Body screen, shown
// once there are 2+ entries. Single-line variant of the former VolumeChart.vue's (removed in item 106)
// approach (shared styling, no "projected" second line since there's
// nothing to project here).
import { computed } from 'vue'
import type { HeightUnit, WeightUnit } from '../lib/types'

// Issue #139: body measurements reuse it, one site at a time, with their
// own label (`weight` is then the measurement).
const props = withDefaults(
  defineProps<{
    points: { recordedAt: string; weight: number }[]
    unit: WeightUnit | HeightUnit
    label?: string
  }>(),
  { label: 'Body weight' },
)

const width = 320
const height = 130
const padding = 8

const minWeight = computed(() => Math.min(...props.points.map((p) => p.weight)))
const maxWeight = computed(() => Math.max(...props.points.map((p) => p.weight)))
// A flat line (every entry the same weight) would divide by zero below —
// pad the range so it still draws as a flat line instead of NaN-ing out.
const range = computed(() => Math.max(maxWeight.value - minWeight.value, 1))

function x(index: number): number {
  if (props.points.length <= 1) return width / 2
  return padding + (index / (props.points.length - 1)) * (width - padding * 2)
}

function y(value: number): number {
  return height - padding - ((value - minWeight.value) / range.value) * (height - padding * 2)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="body-weight-chart">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="chart-svg"
      preserveAspectRatio="none"
      role="img"
      :aria-label="`${label} over time, from ${points[0].weight} to ${points[points.length - 1].weight} ${unit}`"
    >
      <polyline
        :points="points.map((p, i) => `${x(i)},${y(p.weight)}`).join(' ')"
        fill="none"
        class="line"
      />
      <circle v-for="(p, i) in points" :key="i" :cx="x(i)" :cy="y(p.weight)" r="3" class="dot" />
    </svg>
    <div class="range">
      <span>{{ formatDate(points[0].recordedAt) }}</span>
      <span>{{ formatDate(points[points.length - 1].recordedAt) }}</span>
    </div>
  </div>
</template>

<style scoped>
.body-weight-chart {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chart-svg {
  width: 100%;
  height: 130px;
  display: block;
}

.line {
  stroke: var(--accent);
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.dot {
  fill: var(--accent);
}

.range {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-dim);
}
</style>
