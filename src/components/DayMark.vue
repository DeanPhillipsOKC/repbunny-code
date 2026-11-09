<script setup lang="ts">
import { computed } from 'vue'
import { themeDecor, type DayMarkShape } from '../lib/theme'
import { playablePick, type WeekMarkExtra } from '../lib/extras'

// Issue #124: the mark for a logged day on Home's This week tracker. A paw
// print, unless the theme brings its own (Halloween: a candy corn; Autumn,
// #129: a maple leaf; Carrot Patch, #128: a carrot; Christmas, #968: a candy
// cane; Valentine's Day, #969: a candy heart). The
// Theme screen's previews (#119) pass `mark` to draw another theme's.
// Issue #154: an Extras week mark (star, heart, dumbbell) overrides the
// theme's; "Match theme" leaves it to the theme.
const props = defineProps<{ mark?: DayMarkShape | WeekMarkExtra | 'paw' }>()
const shape = computed(() => {
  if (props.mark) return props.mark
  const extra = playablePick('weekMark')
  if (extra !== 'match') return extra as WeekMarkExtra
  return themeDecor.value.dayMark ?? 'paw'
})
</script>

<template>
  <span v-if="shape === 'candy-corn'" class="day-mark candy-corn" aria-hidden="true"></span>
  <span v-else-if="shape === 'maple-leaf'" class="day-mark maple-leaf" aria-hidden="true"></span>
  <span v-else-if="shape === 'carrot'" class="day-mark carrot" aria-hidden="true"></span>
  <span v-else-if="shape === 'candy-cane'" class="day-mark candy-cane" aria-hidden="true"></span>
  <span v-else-if="shape === 'candy-heart'" class="day-mark candy-heart" aria-hidden="true"></span>
  <svg v-else-if="shape === 'star'" class="day-mark star" data-mark="star" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
  </svg>
  <svg v-else-if="shape === 'heart'" class="day-mark heart" data-mark="heart" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21s-8.5-5.3-8.5-11.2C3.5 6.6 5.9 4.5 8.4 4.5c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2 2.5 0 4.9 2.1 4.9 5.3C20.5 15.7 12 21 12 21z" />
  </svg>
  <svg v-else-if="shape === 'dumbbell'" class="day-mark dumbbell" data-mark="dumbbell" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="1.5" y="8" width="3" height="8" rx="1" />
    <rect x="4.5" y="5.5" width="3.5" height="13" rx="1.2" />
    <rect x="8" y="10.6" width="8" height="2.8" rx="1" />
    <rect x="16" y="5.5" width="3.5" height="13" rx="1.2" />
    <rect x="19.5" y="8" width="3" height="8" rx="1" />
  </svg>
  <svg v-else class="day-mark paw" data-mark="paw" viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="12" cy="16" rx="5.5" ry="4.2" />
    <ellipse cx="6" cy="9" rx="2.1" ry="2.6" />
    <ellipse cx="11" cy="6.5" rx="2.1" ry="2.6" />
    <ellipse cx="16.2" cy="7.5" rx="2" ry="2.5" />
    <ellipse cx="19" cy="11.5" rx="1.8" ry="2.3" />
  </svg>
</template>

<style scoped>
.day-mark {
  display: block;
  width: 15px;
  height: 15px;
}

.paw,
.heart {
  fill: var(--accent);
}

.star {
  fill: var(--highlight);
}

.dumbbell {
  fill: var(--secondary);
}

/* A touch bigger than the paw, which fills its box edge to edge. */
.candy-corn,
.maple-leaf,
.carrot,
.candy-cane,
.candy-heart {
  width: 17px;
  height: 17px;
  margin: -1px;
  background: no-repeat center / contain;
}

.candy-corn {
  background-image: var(--decor-candy-corn);
}

.maple-leaf {
  background-image: var(--decor-maple-leaf);
}

.carrot {
  background-image: var(--decor-carrot);
}

.candy-cane {
  background-image: var(--decor-candy-cane);
}

.candy-heart {
  background-image: var(--decor-candy-heart);
}
</style>
