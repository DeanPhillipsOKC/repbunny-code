<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { themeArt } from '../lib/theme'
import { chooseExtra, extrasPicks, kindInfo, personalitySamples, rewardForTier, sampleLine, type ExtraKind, type Reward } from '../lib/extras'
import { countText, tierHeadline, trackInfo, type MilestoneTier } from '../lib/milestones'
import { previewSound } from '../lib/restChime'
import DayMark from './DayMark.vue'

// Issue #187: after Finish, before the recap, when the workout crossed tiers
// that unlock an Extra (Premium only, #190). Says what was earned, previews
// it, and offers Use it now (sets the pick). Mockup:
// docs/design/issue-187-unlock-celebration.html, option A. WorkoutLogger.vue
// shows it over the recap and only with Milestone moments on (#186).
const props = defineProps<{ tiers: MilestoneTier[] }>()
const emit = defineEmits<{ done: [] }>()

interface Unlock {
  tier: MilestoneTier
  reward: Reward
}

const unlocks = computed<Unlock[]>(() =>
  props.tiers.flatMap((tier) => {
    const reward = rewardForTier(tier.id)
    return reward ? [{ tier, reward }] : []
  }),
)
const single = computed(() => (unlocks.value.length === 1 ? unlocks.value[0] : null))

// "Your first record!", "10 workouts!".
function milestoneHeadline(tier: MilestoneTier): string {
  if (tier.count === 1) return `Your first ${trackInfo(tier.track).noun[0]}!`
  return `${countText(tier.track, tier.count)}!`
}

const COUNT_WORDS = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six']
const headline = computed(() =>
  single.value ? milestoneHeadline(single.value.tier) : `Big day. ${COUNT_WORDS[unlocks.value.length] ?? unlocks.value.length} at once!`,
)

// Where each kind shows up, for the one-unlock card.
const WHERE: Record<ExtraKind, string> = {
  weekMark: "Each day you train on Home's This week",
  confetti: 'Falls when you set a record',
  chime: 'Plays when rest ends',
  fanfare: 'Plays when you set a record',
  lines: 'On the rest timer and the recap',
}

function isSound(reward: Reward): boolean {
  return reward.kind === 'chime' || reward.kind === 'fanfare'
}

function inUse(reward: Reward): boolean {
  return extrasPicks.value[reward.kind] === reward.value
}

function useIt(reward: Reward) {
  chooseExtra(reward.kind, reward.value)
  if (single.value) emit('done')
}

// Sun to Sat on the week mark preview; four trained days.
const WEEK = [true, false, true, true, false, true, false]
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const PIECES = ['accent', 'highlight', 'secondary', 'success', 'accent', 'secondary']

const primary = ref<HTMLButtonElement | null>(null)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('done')
}

onMounted(() => {
  primary.value?.focus()
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    class="unlock-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="unlock-headline"
    data-testid="unlock-celebration"
  >
    <!-- Minimal mascot drops the rays, confetti, and bunny (#107); the badge,
         headline, and rewards still say what happened. -->
    <svg class="unlock-burst mascot-art mascot-motion" viewBox="0 0 400 400" aria-hidden="true">
      <g stroke="var(--highlight)" stroke-width="3" stroke-linecap="round">
        <line x1="200" y1="200" x2="200" y2="20" />
        <line x1="200" y1="200" x2="330" y2="70" />
        <line x1="200" y1="200" x2="380" y2="200" />
        <line x1="200" y1="200" x2="330" y2="330" />
        <line x1="200" y1="200" x2="200" y2="380" />
        <line x1="200" y1="200" x2="70" y2="330" />
        <line x1="200" y1="200" x2="20" y2="200" />
        <line x1="200" y1="200" x2="70" y2="70" />
      </g>
    </svg>
    <div v-for="i in 6" :key="i" class="confetti unlock-piece mascot-art mascot-motion" :class="`unlock-piece-${i}`" aria-hidden="true"></div>

    <div class="unlock-content" :class="{ several: !single }">
      <div class="unlock-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--highlight)" aria-hidden="true">
          <path d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z" />
        </svg>
        {{ single ? 'Extra unlocked' : `${unlocks.length} Extras unlocked` }}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--highlight)" aria-hidden="true">
          <path d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z" />
        </svg>
      </div>

      <img class="unlock-mascot mascot-art mascot-motion" :src="themeArt('celebration')" alt="" />

      <div class="unlock-heading">
        <h2 id="unlock-headline" class="unlock-headline">{{ headline }}</h2>
        <p v-if="single" class="unlock-sub">That earned you something new.</p>
      </div>

      <!-- One unlock: a card with the full preview. -->
      <section v-if="single" class="unlock-card" data-testid="unlock-reward">
        <div class="unlock-card-head">
          <div class="unlock-text">
            <span class="unlock-kind">{{ kindInfo(single.reward.kind).title }}</span>
            <span class="unlock-name">{{ single.reward.name }}</span>
            <span class="unlock-detail">{{ WHERE[single.reward.kind] }}</span>
          </div>
          <button
            v-if="isSound(single.reward)"
            type="button"
            class="unlock-play big"
            :aria-label="`Play ${single.reward.name}`"
            @click="previewSound(single.reward.value)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
          </button>
        </div>
        <div v-if="single.reward.kind === 'weekMark'" class="unlock-week" aria-hidden="true">
          <span v-for="(trained, i) in WEEK" :key="i" class="unlock-wd">
            <span class="unlock-wdot" :class="{ trained }"><DayMark v-if="trained" :mark="single.reward.value as 'star'" /></span>
            {{ LETTERS[i] }}
          </span>
        </div>
        <div v-else-if="single.reward.kind === 'confetti'" class="unlock-fall pieces" :data-shape="single.reward.value" aria-hidden="true">
          <i v-for="(c, i) in PIECES" :key="i" :style="{ background: `var(--${c})`, left: `${8 + i * 15}%`, animationDelay: `${(i % 3) * 0.3}s` }"></i>
        </div>
        <template v-else-if="single.reward.kind === 'lines'">
          <p v-for="line in personalitySamples(single.reward.value)" :key="line" class="unlock-quote">“{{ line }}”</p>
        </template>
      </section>

      <!-- Several: a row each, with a small preview and its own Use it now. -->
      <ul v-else class="unlock-list">
        <li v-for="{ tier, reward } in unlocks" :key="tier.id" class="unlock-row" data-testid="unlock-reward">
          <button v-if="isSound(reward)" type="button" class="unlock-play" :aria-label="`Play ${reward.name}`" @click="previewSound(reward.value)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
          </button>
          <span v-else-if="reward.kind === 'weekMark'" class="unlock-mini" aria-hidden="true"><DayMark :mark="reward.value as 'star'" /></span>
          <span v-else-if="reward.kind === 'confetti'" class="unlock-mini pieces" :data-shape="reward.value" aria-hidden="true">
            <i v-for="(c, i) in PIECES.slice(0, 3)" :key="i" :style="{ background: `var(--${c})` }"></i>
          </span>
          <span v-else class="unlock-mini" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--secondary)"><path d="M4 4h16v12H8l-4 4zM7 7v2h10V7zm0 4v2h7v-2z" fill-rule="evenodd" /></svg>
          </span>
          <div class="unlock-text">
            <span class="unlock-kind">{{ kindInfo(reward.kind).title }}</span>
            <span class="unlock-name">{{ reward.name }}</span>
            <span class="unlock-detail">{{ reward.kind === 'lines' ? `“${sampleLine(reward.value)}”` : tierHeadline(tier) }}</span>
          </div>
          <span v-if="inUse(reward)" class="unlock-in-use" data-testid="unlock-in-use">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            In use
          </span>
          <button v-else type="button" class="unlock-use-small" :aria-label="`Use ${reward.name} ${kindInfo(reward.kind).noun} now`" @click="useIt(reward)">
            Use it now
          </button>
        </li>
      </ul>

      <div class="unlock-actions">
        <template v-if="single">
          <button ref="primary" type="button" class="unlock-use" @click="useIt(single.reward)">Use it now</button>
          <button type="button" class="unlock-later" @click="emit('done')">Not now</button>
        </template>
        <button v-else ref="primary" type="button" class="unlock-use" @click="emit('done')">See my recap</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unlock-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: radial-gradient(circle at 50% 30%, var(--surface-2) 0%, var(--bg) 62%, color-mix(in srgb, var(--bg) 88%, var(--shade)) 100%);
  display: flex;
  justify-content: center;
  padding: calc(24px + env(safe-area-inset-top, 0px)) 24px calc(20px + env(safe-area-inset-bottom, 0px));
}

.unlock-burst {
  position: fixed;
  left: 50%;
  top: 28%;
  width: 560px;
  height: 560px;
  transform: translate(-50%, -50%);
  opacity: 0.12;
  pointer-events: none;
  animation: unlock-ray-rotate 22s linear infinite;
}

.unlock-piece {
  position: fixed;
  top: -20px;
  width: 9px;
  height: 13px;
  border-radius: 2px;
  pointer-events: none;
  animation: unlock-confetti-fall linear forwards;
}

.unlock-piece-1 { left: 9%; background: var(--accent); animation-duration: 2.6s; animation-delay: 0.1s; }
.unlock-piece-2 { left: 24%; width: 8px; height: 8px; border-radius: 50%; background: var(--highlight); animation-duration: 3.1s; animation-delay: 0.4s; }
.unlock-piece-3 { left: 44%; background: var(--success); animation-duration: 2.8s; animation-delay: 0.05s; }
.unlock-piece-4 { left: 64%; background: var(--highlight); animation-duration: 3s; animation-delay: 0.25s; }
.unlock-piece-5 { left: 80%; width: 8px; height: 8px; border-radius: 50%; background: var(--secondary); animation-duration: 2.7s; animation-delay: 0.5s; }
.unlock-piece-6 { left: 91%; background: var(--accent); animation-duration: 3.2s; animation-delay: 0.15s; }

.unlock-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 340px;
  margin: auto 0;
}

.unlock-content.several {
  gap: 14px;
}

.unlock-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--highlight);
}

.unlock-mascot {
  width: 160px;
  height: 160px;
  object-fit: contain;
  filter: drop-shadow(0 10px 24px color-mix(in srgb, var(--shade) 45%, transparent));
  animation: unlock-bounce-in 0.62s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.several .unlock-mascot {
  width: 120px;
  height: 120px;
}

.unlock-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.unlock-headline {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  overflow-wrap: anywhere;
}

.several .unlock-headline {
  font-size: 1.5rem;
}

.unlock-sub {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-dim);
}

.unlock-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 18px;
}

.unlock-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.unlock-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
  text-align: left;
}

.unlock-kind {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--secondary);
}

.unlock-name {
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.2;
  color: var(--text);
  overflow-wrap: anywhere;
}

.unlock-row .unlock-name {
  font-size: 0.92rem;
}

.unlock-detail {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.unlock-play {
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--secondary) 50%, transparent);
  color: var(--secondary);
}

.unlock-play svg {
  width: 16px;
  height: 16px;
  margin-left: 2px;
  fill: currentColor;
}

.unlock-play.big {
  width: 64px;
  height: 64px;
}

.unlock-play.big svg {
  width: 22px;
  height: 22px;
}

.unlock-week {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.unlock-wd {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--text-dim);
}

.unlock-wdot {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text) 9%, transparent);
}

.unlock-wdot.trained {
  background: none;
}

.unlock-fall {
  position: relative;
  height: 64px;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.unlock-fall i {
  position: absolute;
  top: -14px;
  animation: unlock-preview-fall 1.6s linear infinite;
}

.unlock-quote {
  margin: 0;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1.4;
  text-align: left;
  color: var(--text);
}

/* Confetti pieces as an Extras shape mask, so each keeps its color (the
   same masks ExtrasPicker.vue uses). */
.pieces i {
  display: block;
  width: 12px;
  height: 12px;
}

.pieces[data-shape='hearts'] i {
  -webkit-mask: var(--extra-heart) no-repeat center / contain;
  mask: var(--extra-heart) no-repeat center / contain;
}

.pieces[data-shape='stars'] i {
  -webkit-mask: var(--extra-star) no-repeat center / contain;
  mask: var(--extra-star) no-repeat center / contain;
}

.pieces[data-shape='plates'] i {
  -webkit-mask: var(--extra-plate) no-repeat center / contain;
  mask: var(--extra-plate) no-repeat center / contain;
}

.unlock-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.unlock-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.unlock-mini {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.unlock-mini :deep(.day-mark) {
  width: 20px;
  height: 20px;
}

.unlock-mini.pieces i {
  width: 11px;
  height: 11px;
}

.unlock-mini.pieces i:nth-child(2) {
  align-self: flex-end;
  margin-bottom: 9px;
}

.unlock-use-small,
.unlock-in-use {
  flex-shrink: 0;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 800;
  white-space: nowrap;
}

.unlock-use-small {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.unlock-in-use {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  color: var(--success);
}

.unlock-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.unlock-use {
  width: 100%;
  min-height: 52px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-size: 1rem;
  font-weight: 800;
}

.unlock-use:active,
.unlock-use-small:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.unlock-later {
  min-height: 44px;
  border: none;
  background: none;
  color: var(--accent);
  font-size: 0.95rem;
  font-weight: 700;
}

@keyframes unlock-bounce-in {
  0% { transform: scale(0.35) rotate(-6deg); opacity: 0; }
  55% { transform: scale(1.1) rotate(2deg); opacity: 1; }
  75% { transform: scale(0.95) rotate(-1deg); }
  100% { transform: scale(1) rotate(0deg); }
}

@keyframes unlock-confetti-fall {
  0% { transform: translateY(-30px) rotate(0deg); opacity: 0; }
  12% { opacity: 1; }
  100% { transform: translateY(760px) rotate(340deg); opacity: 0; }
}

@keyframes unlock-ray-rotate {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

@keyframes unlock-preview-fall {
  from { transform: translateY(0) rotate(0deg); }
  to { transform: translateY(90px) rotate(200deg); }
}

@media (prefers-reduced-motion: reduce) {
  .unlock-burst,
  .unlock-mascot,
  .unlock-piece {
    animation: none;
  }

  .unlock-piece {
    display: none;
  }

  .unlock-fall i {
    animation: none;
    top: 26px;
  }
}
</style>
