<script setup lang="ts">
// Issue #139: "How to measure", opened from the Measurements card. Free for
// everyone; the same tips are on the measurements guide page.
import { onMounted, onUnmounted } from 'vue'
import { MEASURE_HABITS, MEASURE_TIPS, SITE_LABELS } from '../lib/measurements'
import { MEASUREMENT_SITES } from '../lib/types'

const emit = defineEmits<{ dismiss: [] }>()

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('dismiss')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="guide-overlay" role="dialog" aria-modal="true" aria-labelledby="measure-guide-title" @click.self="emit('dismiss')">
    <div class="guide-panel">
      <div class="guide-header">
        <h2 id="measure-guide-title">How to measure</h2>
        <button type="button" class="icon-button" aria-label="Close how to measure" @click="emit('dismiss')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <img src="/measure/cover.webp" alt="" class="cover mascot-art" width="415" height="420" />

      <ul class="habits">
        <li v-for="habit in MEASURE_HABITS" :key="habit">{{ habit }}</li>
      </ul>

      <dl class="sites">
        <div v-for="site in MEASUREMENT_SITES" :key="site" class="site">
          <img :src="`/measure/${site}.webp`" alt="" class="site-art mascot-art" width="150" height="300" loading="lazy" />
          <div class="site-text">
            <dt>{{ SITE_LABELS[site] }}</dt>
            <dd>{{ MEASURE_TIPS[site] }}</dd>
          </div>
        </div>
      </dl>

      <button type="button" class="done" @click="emit('dismiss')">Got it</button>
    </div>
  </div>
</template>

<style scoped>
.guide-overlay {
  position: fixed;
  inset: 0;
  z-index: 65;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.guide-panel {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px calc(24px + env(safe-area-inset-bottom, 0px));
}

.guide-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.guide-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  text-transform: none;
  letter-spacing: normal;
  color: var(--text);
}

.icon-button {
  width: 36px;
  height: 36px;
  min-height: auto;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.habits {
  margin: 0 0 12px;
  padding-left: 18px;
  list-style: disc;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.habits li {
  display: list-item;
  margin-bottom: 4px;
}

.sites {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cover {
  display: block;
  height: 120px;
  width: auto;
  margin: 0 auto 10px;
}

.site {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.site-art {
  flex-shrink: 0;
  width: 62px;
  height: 116px;
  object-fit: contain;
}

.site-text {
  min-width: 0;
}

.site dt {
  font-weight: 800;
  font-size: 0.9rem;
}

.site dd {
  margin: 2px 0 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.done {
  width: 100%;
  margin-top: 14px;
}
</style>
