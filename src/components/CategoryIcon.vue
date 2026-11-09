<script setup lang="ts">
import type { TemplateCategory } from '../lib/templateCategory'

// Backlog item 111/112: template category glyphs, built true to
// docs/design/item-112-category-icons.html. Upper/Lower/Full/Core share one
// rounded figure with the trained region lit and the rest dimmed; Cardio and
// Other get their own glyphs. Decorative only: callers put the category's
// name in text (or an accessible description) themselves.
defineProps<{ category: TemplateCategory }>()

const LIT: Record<'upper' | 'lower' | 'full' | 'core', string[]> = {
  upper: ['head', 'arms', 'chest'],
  lower: ['legs'],
  full: ['head', 'arms', 'chest', 'core', 'legs'],
  core: ['core'],
}

function dim(category: TemplateCategory, part: string): number | undefined {
  return category in LIT && LIT[category as keyof typeof LIT].includes(part) ? undefined : 0.28
}
</script>

<template>
  <svg
    v-if="category === 'upper' || category === 'lower' || category === 'full' || category === 'core'"
    class="category-icon"
    viewBox="0 0 24 32"
    fill="currentColor"
    aria-hidden="true"
  >
    <circle cx="12" cy="4.2" r="2.7" :opacity="dim(category, 'head')" />
    <g :opacity="dim(category, 'arms')">
      <rect x="3" y="8.4" width="2.8" height="10" rx="1.4" transform="rotate(8 4.4 8.4)" />
      <rect x="18.2" y="8.4" width="2.8" height="10" rx="1.4" transform="rotate(-8 19.6 8.4)" />
    </g>
    <rect x="6.6" y="7.6" width="10.8" height="6.6" rx="2.6" :opacity="dim(category, 'chest')" />
    <rect x="7.3" y="14.9" width="9.4" height="4.3" rx="1.6" :opacity="dim(category, 'core')" />
    <g :opacity="dim(category, 'legs')">
      <rect x="7.4" y="19.9" width="4.1" height="11" rx="2" />
      <rect x="12.5" y="19.9" width="4.1" height="11" rx="2" />
    </g>
  </svg>
  <svg
    v-else-if="category === 'cardio'"
    class="category-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 0 0-7.1 7.1l1.3 1.3L12 21l7.1-7 1.3-1.3a5 5 0 0 0 0-7.1z"
      fill="currentColor"
      fill-opacity="0.22"
    />
    <path d="M3.5 12h4l1.8-3 2.6 6 1.8-3h6.8" />
  </svg>
  <svg v-else class="category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <rect x="2.5" y="8" width="3.2" height="8" rx="1.2" fill="currentColor" />
    <rect x="18.3" y="8" width="3.2" height="8" rx="1.2" fill="currentColor" />
    <rect x="5.7" y="9.6" width="2.4" height="4.8" rx="0.8" fill="currentColor" fill-opacity="0.6" />
    <rect x="15.9" y="9.6" width="2.4" height="4.8" rx="0.8" fill="currentColor" fill-opacity="0.6" />
    <path d="M8.1 12h7.8" />
  </svg>
</template>
