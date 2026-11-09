<script setup lang="ts">
// Issue #44: the Progress hub's small trend lines (hub tiles, Lift progress
// rows). Decorative -- the value next to it carries the meaning -- so it's
// hidden from assistive tech. Same drawing as the mockup's spark() helper in
// docs/design/issue-44-progress-hub.html.
import { computed } from 'vue'

const props = defineProps<{
  values: number[]
  width: number
  height: number
  // Lower is better (assist): flip so improvement still reads as up.
  flipped?: boolean
}>()

const pad = 3

const coords = computed(() => {
  const n = props.values.length
  if (n === 0) return []
  const lo = Math.min(...props.values)
  const span = Math.max(Math.max(...props.values) - lo, 1)
  return props.values.map((v, i) => {
    const t = (v - lo) / span
    return {
      x: n === 1 ? props.width / 2 : pad + (i / (n - 1)) * (props.width - pad * 2),
      y: props.flipped ? pad + t * (props.height - pad * 2) : props.height - pad - t * (props.height - pad * 2),
    }
  })
})

const points = computed(() => coords.value.map((c) => `${c.x},${c.y}`).join(' '))
const last = computed(() => coords.value[coords.value.length - 1])
</script>

<template>
  <svg class="sparkline" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" aria-hidden="true">
    <polyline
      v-if="coords.length > 1"
      :points="points"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <circle v-if="last" :cx="last.x" :cy="last.y" r="2.5" fill="currentColor" />
  </svg>
</template>

<style scoped>
.sparkline {
  display: block;
  flex-shrink: 0;
  overflow: visible;
}
</style>
