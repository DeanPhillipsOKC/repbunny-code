<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { hasPremium, openPremiumSheet } from '../lib/premium'
import { activeTheme, artFor, chooseTheme, themeStyle, type Theme } from '../lib/theme'
import DayMark from './DayMark.vue'

// Issue #119: a full-screen look at one theme before picking it, drawn in that
// theme's own tokens (themeStyle) so it works whatever theme is active. Three
// mock screens to swipe through: Home, the rest timer, and a record. The mock
// numbers are examples, not the user's data. A free user can keep it with
// Premium (picking it first, so unlocking saves it, #107); with Premium it's
// "Use this theme". Nudge rules from #114: no pressure copy, one tap out.
const props = defineProps<{ theme: Theme }>()
const emit = defineEmits<{ close: [] }>()

const SCREENS = ['Home', 'Rest timer', 'Record'] as const
const screen = ref(0)
const strip = ref<HTMLElement | null>(null)
const style = computed(() => themeStyle(props.theme))
const decor = computed(() => props.theme.decor ?? {})
const isCurrent = computed(() => activeTheme.value.theme === props.theme.id)
// Sun to Sat; four logged days.
const WEEK = [true, false, true, true, false, true, false]

function onScroll() {
  const el = strip.value
  if (el) screen.value = Math.round(el.scrollLeft / el.clientWidth)
}

function goTo(index: number) {
  const el = strip.value
  if (el) el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
}

function keepWithPremium() {
  chooseTheme({ theme: props.theme.id })
  openPremiumSheet('themes')
}

function useTheme() {
  chooseTheme({ theme: props.theme.id })
  emit('close')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="preview" :style="style" role="dialog" aria-modal="true" :aria-label="`${theme.label} preview`">
    <header class="top">
      <div class="top-text">
        <span class="eyebrow">Theme preview</span>
        <h3 class="title">{{ theme.label }}</h3>
      </div>
      <button type="button" class="close" aria-label="Close preview" @click="emit('close')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <div ref="strip" class="strip" @scroll.passive="onScroll">
      <!-- Home -->
      <section class="slide" aria-label="Home in this theme">
        <div class="mock">
          <div class="m-title">Log a workout</div>
          <div class="m-row">
          <div class="m-tile">
            <span v-if="decor.corner" class="m-corner" :class="decor.corner" aria-hidden="true"></span>
            <span class="m-eyebrow">This week</span>
            <span class="m-big">4 <small>workouts</small></span>
            <div class="m-week">
              <span v-for="(done, i) in WEEK" :key="i" class="m-day" :class="{ done }">
                <DayMark v-if="done" :mark="decor.dayMark ?? 'paw'" />
              </span>
            </div>
          </div>
          <div class="m-tile m-pr">
            <span class="m-new">NEW</span>
            <span class="m-pr-title">Volume PR!</span>
            <span class="m-pr-sub">Bench press</span>
          </div>
          </div>
          <div class="m-card">
            <span class="m-card-title">What are you training today?</span>
            <span class="m-template"><b>Push day</b><small>5 exercises</small></span>
            <span class="m-template"><b>Leg day</b><small>4 exercises</small></span>
            <span class="m-link">+ New routine</span>
          </div>
          <nav class="m-nav" aria-hidden="true">
            <span v-for="(tab, i) in ['Home', 'Progress', 'Routines', 'Exercises']" :key="tab" :class="{ on: i === 0 }">
              <i></i>{{ tab }}
            </span>
          </nav>
        </div>
      </section>

      <!-- Rest timer -->
      <section class="slide" aria-label="Rest timer in this theme">
        <div class="mock mock-center">
          <span class="m-pill"><span class="m-dot"></span>Resting</span>
          <div class="m-glow-wrap">
            <span class="m-glow"></span>
            <img class="m-rest-bunny" :src="artFor(theme, 'rest')" alt="" />
          </div>
          <span class="m-count">1:24</span>
          <span class="m-sub">Next: Bench press</span>
          <span class="m-bar"><span></span></span>
          <span class="m-button ghost">Skip Rest</span>
        </div>
      </section>

      <!-- Record -->
      <section class="slide" aria-label="Record celebration in this theme">
        <div class="mock mock-center record">
          <span
            v-for="i in 8"
            :key="i"
            class="m-confetti"
            :class="[`c${i}`, { candy: decor.confetti === 'candy-corn', leaf: decor.confetti === 'leaves', carrot: decor.confetti === 'carrot', cane: decor.confetti === 'candy-cane', heart: decor.confetti === 'candy-heart' }]"
            aria-hidden="true"
          ></span>
          <span class="m-badge">★ New record ★</span>
          <img class="m-record-bunny" :src="artFor(theme, 'celebration-flex')" alt="" />
          <span class="m-headline">That's a PR. No notes.</span>
          <span class="m-stat">
            <small>Bench press</small>
            <b>185 lb × 8</b>
            <em>Beat 185 lb × 7 from Oct 9</em>
          </span>
          <span class="m-button">Nice!</span>
        </div>
      </section>
    </div>

    <div class="dots" role="group" aria-label="Preview screens">
      <button
        v-for="(name, i) in SCREENS"
        :key="name"
        type="button"
        class="dot"
        :class="{ on: screen === i }"
        :aria-label="name"
        :aria-pressed="screen === i"
        @click="goTo(i)"
      ></button>
    </div>

    <footer class="actions">
      <template v-if="hasPremium('themes')">
        <button type="button" class="primary" :disabled="isCurrent" @click="useTheme">
          {{ isCurrent ? "You're using this theme" : 'Use this theme' }}
        </button>
      </template>
      <template v-else>
        <p class="note">Themes are part of Premium. Your workouts, history, and backups stay free.</p>
        <button type="button" class="primary" @click="keepWithPremium">Keep it with Premium</button>
      </template>
      <button type="button" class="secondary" @click="emit('close')">Not now</button>
    </footer>
  </div>
</template>

<style scoped>
.preview {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  padding: calc(14px + var(--safe-top)) 0 calc(14px + env(safe-area-inset-bottom, 0px));
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px 10px;
}

.top-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.eyebrow {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
}

.close {
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.strip {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.strip::-webkit-scrollbar {
  display: none;
}

.slide {
  flex: 0 0 100%;
  scroll-snap-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4px 16px;
  min-width: 0;
}

/* A phone-shaped frame around each mock screen. */
.mock {
  position: relative;
  width: min(300px, 100%);
  height: min(500px, 100%);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 26px;
  box-shadow: 0 18px 40px -20px color-mix(in srgb, var(--shade) 60%, transparent);
}

.mock-center {
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}

.m-title {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
}

.m-tile,
.m-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.m-corner {
  position: absolute;
  top: 0;
  right: 0;
  width: 52px;
  height: 52px;
  border-top-right-radius: inherit;
  background: color-mix(in srgb, var(--text) 17%, transparent);
  -webkit-mask: var(--decor-web) no-repeat top right / contain;
  mask: var(--decor-web) no-repeat top right / contain;
}

.m-corner.web {
  -webkit-mask-image: var(--decor-web-spider);
  mask-image: var(--decor-web-spider);
}

.m-corner.leaves {
  -webkit-mask-image: var(--decor-sprig-drift);
  mask-image: var(--decor-sprig-drift);
}

.m-row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 8px;
}

.m-pr {
  justify-content: center;
  background: color-mix(in srgb, var(--success) 14%, transparent);
  border-color: color-mix(in srgb, var(--success) 40%, var(--border));
}

.m-new {
  align-self: flex-start;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--success);
  color: var(--accent-text);
  font-size: 0.55rem;
  font-weight: 800;
}

.m-pr-title {
  font-size: 0.85rem;
  font-weight: 800;
}

.m-pr-sub {
  font-size: 0.66rem;
  color: var(--text-dim);
}

.m-nav {
  margin: auto -14px -16px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 8px 4px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.m-nav span {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 0.56rem;
  font-weight: 700;
  color: var(--text-dim);
}

.m-nav i {
  width: 30px;
  height: 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-dim) 25%, transparent);
}

.m-nav span.on {
  color: var(--accent);
}

.m-nav span.on i {
  background: color-mix(in srgb, var(--accent) 30%, transparent);
}

.m-eyebrow {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.m-big {
  font-size: 1.3rem;
  font-weight: 800;
}

.m-big small {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
}

.m-week {
  display: flex;
  gap: 3px;
  margin-top: 4px;
}

.m-day {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text) 9%, transparent);
}

.m-day.done {
  background: none;
}

.m-day :deep(.day-mark) {
  width: 13px;
  height: 13px;
}

.m-day :deep(.candy-corn),
.m-day :deep(.maple-leaf),
.m-day :deep(.carrot),
.m-day :deep(.candy-cane),
.m-day :deep(.candy-heart) {
  width: 15px;
  height: 15px;
}

.m-card-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin-bottom: 2px;
}

.m-template {
  display: flex;
  flex-direction: column;
  padding: 9px 10px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 0.85rem;
}

.m-template small {
  font-size: 0.7rem;
  color: var(--text-dim);
}

.m-link {
  margin-top: 2px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent);
  text-decoration: underline;
}

.m-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.m-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.m-glow-wrap {
  position: relative;
  width: 150px;
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.m-glow {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 35%, transparent) 0%, transparent 70%);
}

.m-rest-bunny {
  position: relative;
  width: 124px;
  height: 124px;
  object-fit: contain;
}

.m-count {
  font-size: 2.8rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.m-sub {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.m-bar {
  width: 80%;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.m-bar span {
  display: block;
  width: 62%;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.m-button {
  width: 85%;
  padding: 10px;
  border-radius: 12px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.9rem;
  font-weight: 700;
}

.m-button.ghost {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}

.record {
  background: radial-gradient(circle at 50% 38%, var(--surface-2) 0%, var(--bg) 70%);
}

.m-badge {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--highlight);
}

.m-record-bunny {
  width: 120px;
  height: 120px;
  object-fit: contain;
}

@media (max-height: 700px) {
  .m-record-bunny,
  .m-glow-wrap {
    width: 90px;
    height: 90px;
  }

  .m-rest-bunny {
    width: 80px;
    height: 80px;
  }
}

.m-headline {
  font-size: 1.05rem;
  font-weight: 700;
}

.m-stat {
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.m-stat small {
  font-size: 0.72rem;
  color: var(--text-dim);
}

.m-stat b {
  font-size: 1.1rem;
}

.m-stat em {
  font-style: normal;
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--success);
}

/* Confetti frozen mid-fall. */
.m-confetti {
  position: absolute;
  width: 7px;
  height: 11px;
  border-radius: 2px;
  background: var(--accent);
}

.m-confetti.candy {
  width: 13px;
  height: 13px;
  border-radius: 0;
  background: var(--decor-candy-corn) no-repeat center / contain;
}

.c1 { left: 10%; top: 9%; transform: rotate(-20deg); }
.c2 { left: 28%; top: 20%; transform: rotate(35deg); background: var(--highlight); }
.c3 { left: 78%; top: 8%; transform: rotate(15deg); background: var(--secondary); }
.c4 { left: 88%; top: 30%; transform: rotate(-35deg); }
.c5 { left: 6%; top: 42%; transform: rotate(60deg); background: var(--success); }
.c6 { left: 72%; top: 22%; transform: rotate(-60deg); background: var(--highlight); }
.c7 { left: 18%; top: 31%; transform: rotate(10deg); background: var(--secondary); }
.c8 { left: 60%; top: 5%; transform: rotate(45deg); }

.m-confetti.candy.c2,
.m-confetti.candy.c3,
.m-confetti.candy.c5,
.m-confetti.candy.c6,
.m-confetti.candy.c7 {
  background: var(--decor-candy-corn) no-repeat center / contain;
}

/* Carrot Patch (#128). */
.m-confetti.carrot {
  width: 14px;
  height: 14px;
  border-radius: 0;
  background: var(--decor-carrot) no-repeat center / contain;
}

/* Christmas (#968). */
.m-confetti.cane {
  width: 14px;
  height: 14px;
  border-radius: 0;
  background: var(--decor-candy-cane) no-repeat center / contain;
}

/* Valentine's Day (#969). */
.m-confetti.heart {
  width: 14px;
  height: 14px;
  border-radius: 0;
  background: var(--decor-candy-heart) no-repeat center / contain;
}

/* Autumn (#129): a mix of the three leaves, in fixed spots here. */
.m-confetti.leaf {
  width: 14px;
  height: 14px;
  border-radius: 0;
}

.m-confetti.leaf.c1,
.m-confetti.leaf.c4,
.m-confetti.leaf.c6 {
  background: var(--decor-maple-leaf) no-repeat center / contain;
}

.m-confetti.leaf.c2,
.m-confetti.leaf.c5,
.m-confetti.leaf.c8 {
  background: var(--decor-birch-leaf) no-repeat center / contain;
}

.m-confetti.leaf.c3,
.m-confetti.leaf.c7 {
  background: var(--decor-oak-leaf) no-repeat center / contain;
}

.dots {
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 8px 0 4px;
}

.dot {
  width: 28px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.dot.on::before {
  width: 20px;
  border-radius: 999px;
  background: var(--accent);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 16px 0;
  width: 100%;
  max-width: 480px;
  align-self: center;
}

.note {
  margin: 0;
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.primary {
  width: 100%;
  min-height: 50px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.primary:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.primary:disabled {
  opacity: 0.7;
}

.secondary {
  width: 100%;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}
</style>
