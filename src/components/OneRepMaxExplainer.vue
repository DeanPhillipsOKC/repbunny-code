<script setup lang="ts">
import { themeArt } from '../lib/theme'
// Issue #21: "What's est. 1RM?" explainer. A bottom sheet layered above the
// exercise history overlay (z-index 60) so closing it lands right back on
// the chart; every close path (backdrop, ✕, Got it, Escape) closes only this.
import { onMounted, onUnmounted } from 'vue'

const emit = defineEmits<{ dismiss: [] }>()

// Capture phase on window runs before the history overlay's own document
// Escape listener, and stopping it there keeps that overlay open.
function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('dismiss')
}

onMounted(() => window.addEventListener('keydown', handleKeydown, true))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <div class="explainer-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="What's est. 1RM?">
      <div class="sheet-top">
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <img class="art mascot-art" :src="themeArt('clipboard')" alt="" width="150" height="150" />
      <h3 class="title">What's est. 1RM?</h3>
      <p class="body">
        <b>1RM</b> means your <b>one-rep max</b>: the most you could lift for a single rep. You never have to actually
        try it. RepBunny <b>estimates</b> it from the sets you already log.
      </p>

      <div class="example">
        <div>
          <div class="example-cap">You lifted</div>
          <div class="example-lift">185 lb × 8 reps</div>
        </div>
        <span class="example-arrow" aria-hidden="true">→</span>
        <div class="example-right">
          <div class="example-cap">Est. 1RM</div>
          <div class="example-result">≈ 234 lb</div>
        </div>
      </div>

      <ul class="reasons">
        <li>
          <span class="icon" style="--c: var(--accent)" aria-hidden="true">⇅</span>
          <span><b>Compare any set.</b> 8 reps one week and 5 the next still land on the same scale.</span>
        </li>
        <li>
          <span class="icon" style="--c: var(--success)" aria-hidden="true">↗</span>
          <span><b>See real progress.</b> If the line climbs, you're getting stronger, even when the weight on the bar didn't change.</span>
        </li>
        <li>
          <span class="icon" style="--c: var(--secondary)" aria-hidden="true">✓</span>
          <span><b>No risky max-out.</b> It's a guide, not a goal. Most accurate for sets of 1 to 12 reps.</span>
        </li>
      </ul>

      <button type="button" class="btn-accent got-it" @click="emit('dismiss')">Got it</button>
    </div>
  </div>
</template>

<style scoped>
.explainer-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 16px 16px calc(20px + env(safe-area-inset-bottom, 0px));
}

.sheet-top {
  display: flex;
  justify-content: flex-end;
}

.sheet-close {
  width: 36px;
  height: 36px;
  min-height: auto;
  padding: 0;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.art {
  display: block;
  width: 150px;
  height: 150px;
  object-fit: contain;
  margin: -12px auto 2px;
}

.title {
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text);
  text-align: center;
}

.body {
  font-size: 0.88rem;
  line-height: 1.5;
  margin: 0 0 12px;
}

.body b,
.reasons b {
  color: var(--text);
}

.example {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  margin-bottom: 12px;
}

.example-cap {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.example-lift {
  font-weight: 800;
  font-size: 1.05rem;
}

.example-arrow {
  color: var(--text-dim);
  font-size: 1.2rem;
}

.example-right {
  text-align: right;
}

.example-result {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--accent);
  white-space: nowrap;
}

.reasons {
  margin: 0 0 14px;
}

.reasons li {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 18%, transparent);
}

.got-it {
  margin-top: 0;
  font-weight: 800;
}
</style>
