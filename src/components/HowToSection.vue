<script setup lang="ts">
import { ref } from 'vue'

// Issue #39: a library entry's numbered how-to steps, collapsed by default.
// Shown on the library detail screen and on the history of any exercise
// added from the library.
defineProps<{ steps: string[] }>()

const open = ref(false)
</script>

<template>
  <div class="how-to">
    <button type="button" class="how-to-toggle" :aria-expanded="open" @click="open = !open">
      <span>How to</span>
      <span class="how-to-chevron" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>
    <ol v-if="open" class="how-to-steps">
      <li v-for="(step, index) in steps" :key="index">{{ step }}</li>
    </ol>
  </div>
</template>

<style scoped>
.how-to {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0 14px;
}

.how-to-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-height: 46px;
  padding: 0;
  background: transparent;
  border: none;
  font-weight: 800;
  font-size: 0.9rem;
}

.how-to-chevron {
  color: var(--text-dim);
}

.how-to-steps {
  list-style: decimal;
  margin: 0 0 12px;
  padding-left: 18px;
  color: var(--text-dim);
  font-size: 0.84rem;
  line-height: 1.5;
}

.how-to-steps li {
  margin-bottom: 4px;
}
</style>
