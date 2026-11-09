<script setup lang="ts">
import { themeArt } from '../lib/theme'
import { pickCelebration } from '../lib/celebration'

// Item 70: shown the first time a given template is ever completed, when
// there's no earlier session to compare against. Item 106 moved it to the
// top of the post-finish recap (FinishRecap.vue). Reuses the same mascot pool
// RecordCelebration.vue draws from, picked fresh each time this mounts.
defineProps<{ routine?: string | null }>()
const variant = pickCelebration()
</script>

<template>
  <div class="first-workout">
    <img class="first-workout-mascot mascot-art" :src="themeArt(variant.art)" alt="" />
    <template v-if="routine">
      <h3 class="first-workout-headline">First {{ routine }} logged.</h3>
      <p class="first-workout-sub">Your next {{ routine }} will show how it compares.</p>
    </template>
    <template v-else>
      <h3 class="first-workout-headline">First workout logged. {{ variant.phrase }}</h3>
      <p class="first-workout-sub">Track your volume over time as you complete more workouts.</p>
    </template>
  </div>
</template>

<style scoped>
.first-workout {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 4px 0 12px;
}

.first-workout-mascot {
  width: 96px;
  height: 96px;
  object-fit: contain;
  filter: drop-shadow(0 6px 16px color-mix(in srgb, var(--shade) 35%, transparent));
}

.first-workout-headline {
  margin: 0;
  font-size: 1.05rem;
}

.first-workout-sub {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-dim);
}
</style>
