<script setup lang="ts">
import type { MuscleGroup } from '../lib/muscleGroups'

// Issue #42: muscle group glyphs, built true to screen 1 of
// docs/design/issue-39-exercise-library.html. The CategoryIcon.vue figure,
// extended with shoulder caps and a two-circle glutes part; the worked part
// is lit and the rest dimmed. Back lights chest + core and adds a spine and V
// line so it reads as the back view. Cardio uses CategoryIcon's heart glyph.
// Decorative only: callers always show the group's label as text, and set
// the tint via `color` (MUSCLE_GROUP_TINTS) since this draws in currentColor.
defineProps<{ group: MuscleGroup }>()

const LIT: Record<Exclude<MuscleGroup, 'cardio'>, string[]> = {
  chest: ['chest'],
  back: ['chest', 'core'],
  shoulders: ['shoulders'],
  arms: ['arms'],
  core: ['core'],
  glutes: ['glutes'],
  legs: ['legs'],
}

function dim(group: MuscleGroup, part: string): number | undefined {
  return group !== 'cardio' && LIT[group].includes(part) ? undefined : 0.26
}
</script>

<template>
  <svg
    v-if="group === 'cardio'"
    class="muscle-icon"
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
  <svg v-else class="muscle-icon" viewBox="0 0 24 32" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="4.2" r="2.7" :opacity="dim(group, 'head')" />
    <g :opacity="dim(group, 'shoulders')">
      <circle cx="6" cy="9.1" r="2.3" />
      <circle cx="18" cy="9.1" r="2.3" />
    </g>
    <g :opacity="dim(group, 'arms')">
      <rect x="3.1" y="10.8" width="2.8" height="8.6" rx="1.4" transform="rotate(8 4.5 10.8)" />
      <rect x="18.1" y="10.8" width="2.8" height="8.6" rx="1.4" transform="rotate(-8 19.5 10.8)" />
    </g>
    <rect x="7.6" y="7.4" width="8.8" height="6.4" rx="2.4" :opacity="dim(group, 'chest')" />
    <rect x="7.8" y="14.4" width="8.4" height="4.4" rx="1.6" :opacity="dim(group, 'core')" />
    <g :opacity="dim(group, 'glutes')">
      <circle cx="10" cy="21.2" r="2.35" />
      <circle cx="14" cy="21.2" r="2.35" />
    </g>
    <g :opacity="dim(group, 'legs')">
      <rect x="7.6" y="23.2" width="3.9" height="8.4" rx="1.9" />
      <rect x="12.5" y="23.2" width="3.9" height="8.4" rx="1.9" />
    </g>
    <template v-if="group === 'back'">
      <path d="M12 7.8v10.6" stroke="var(--bg)" stroke-width="1.1" stroke-linecap="round" />
      <path d="M9.2 9.6l2.8 3 2.8-3" stroke="var(--bg)" stroke-width="0.9" fill="none" stroke-linecap="round" />
    </template>
  </svg>
</template>
