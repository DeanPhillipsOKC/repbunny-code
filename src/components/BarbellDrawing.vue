<script setup lang="ts">
import { computed } from 'vue'
import { plateStyle } from '../lib/plates'
import type { WeightUnit } from '../lib/types'

// Issue #22: a bar with the same plates on both ends, heaviest nearest the
// middle (docs/design/issue-22-plate-calculator.html). `scale` shrinks it
// for the "pick the closest" option cards.
const props = withDefaults(defineProps<{ perSide: number[]; unit: WeightUnit; scale?: number }>(), { scale: 1 })

const W = 360
const height = computed(() => Math.round(110 * props.scale))
const cy = computed(() => height.value / 2)
const COLLAR = 118

const plates = computed(() => {
  let xl = COLLAR - 6
  let xr = W - COLLAR + 6
  return props.perSide.map((plate, i) => {
    const style = plateStyle(plate, props.unit)
    const h = style.height * props.scale
    const w = style.width
    const shape = { key: i, color: style.color, y: cy.value - h / 2, h, w, left: xl - w, right: xr }
    xl -= w + 2
    xr += w + 2
    return shape
  })
})
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${height}`" class="barbell" :style="{ height: `${height}px` }" aria-hidden="true">
    <rect x="6" :y="cy - 3 * scale" :width="W - 12" :height="6 * scale" :rx="3 * scale" fill="#6d5a78" />
    <rect :x="COLLAR - 5" :y="cy - 11 * scale" width="5" :height="22 * scale" rx="2" fill="#8b7896" />
    <rect :x="W - COLLAR" :y="cy - 11 * scale" width="5" :height="22 * scale" rx="2" fill="#8b7896" />
    <template v-for="p in plates" :key="p.key">
      <rect :x="p.left" :y="p.y" :width="p.w" :height="p.h" rx="3" :style="{ fill: p.color }" />
      <rect :x="p.right" :y="p.y" :width="p.w" :height="p.h" rx="3" :style="{ fill: p.color }" />
    </template>
  </svg>
</template>

<style scoped>
.barbell {
  display: block;
  width: 100%;
}
</style>
