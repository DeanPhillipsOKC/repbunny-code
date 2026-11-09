<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  chooseExtra,
  extrasPicks,
  isUnlocked,
  kindInfo,
  personalitySamples,
  rewardsOf,
  sampleLine,
  type ExtraKind,
  type Reward,
} from '../lib/extras'
import { countText, tierById, type MilestoneCounts } from '../lib/milestones'
import { isPremium, openPremiumSheet } from '../lib/premium'
import { previewSound } from '../lib/restChime'
import { themeDecor } from '../lib/theme'
import DayMark from './DayMark.vue'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #154: one Extras kind's options (mockup
// docs/design/issue-154-milestone-rewards.html, option B2), opened from the
// Theme screen's Extras rows. An unlocked option is picked on tap (a sound
// also plays). A locked one shows what unlocks it and, on tap, a preview with
// how close the user is; it can't be picked. Extras are Premium (#190): for a
// free user every option but the default is tagged Premium, and its preview
// offers Premium instead of progress.
const props = defineProps<{
  kind: ExtraKind
  unlockedTiers: ReadonlySet<string>
  counts: MilestoneCounts | null
}>()
const emit = defineEmits<{ back: []; dismiss: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('back'))

const info = computed(() => kindInfo(props.kind))
const isSound = computed(() => props.kind === 'chime' || props.kind === 'fanfare')

interface Option {
  value: string
  name: string
  reward: Reward | null
  unlocked: boolean
}

const options = computed<Option[]>(() => [
  { value: info.value.defaultValue, name: info.value.defaultName, reward: null, unlocked: true },
  ...rewardsOf(props.kind).map((r) => ({ value: r.value, name: r.name, reward: r, unlocked: isUnlocked(r, props.unlockedTiers) })),
])

// The pick, or the default when it's locked (no Premium, or not earned, #190).
const current = computed(() => {
  const picked = options.value.find((o) => o.value === extrasPicks.value[props.kind])
  return picked?.unlocked ? picked.value : info.value.defaultValue
})

// The locked option being previewed.
const trying = ref<string | null>(null)

// Issue #458: the Extras sounds are louder to the ear than Classic, so a line
// under the options says so once one is picked or has been tried. Off isn't a
// sound, and Classic is the reference.
const quiet = (value: string) => value === info.value.defaultValue || value === 'off'
const heardLoud = ref(false)
const warnLoud = computed(() => isSound.value && (heardLoud.value || !quiet(current.value)))

function tap(option: Option) {
  if (isSound.value) {
    previewSound(option.value)
    if (!quiet(option.value)) heardLoud.value = true
  }
  if (!option.unlocked) {
    trying.value = trying.value === option.value && !isSound.value ? null : option.value
    return
  }
  trying.value = null
  chooseExtra(props.kind, option.value)
}

function rule(reward: Reward): string {
  const tier = tierById(reward.tier)
  return tier ? countText(tier.track, tier.count) : ''
}

function progress(reward: Reward): { pct: number; text: string; more: string } | null {
  const tier = tierById(reward.tier)
  if (!tier || !props.counts) return null
  const have = Math.min(props.counts[tier.track], tier.count)
  const left = tier.count - have
  return {
    pct: Math.round((have / tier.count) * 100),
    text: `${have.toLocaleString('en-US')} of ${countText(tier.track, tier.count)}.`,
    more: `${left.toLocaleString('en-US')} more and it's yours.`,
  }
}

// What a week mark option draws: "match" is the theme's own mark.
function markFor(value: string) {
  if (value === 'match') return themeDecor.value.dayMark ?? 'paw'
  return value as 'star' | 'heart' | 'dumbbell'
}

// What a confetti option drops: "match" is the theme's own.
function confettiFor(value: string): string {
  if (value === 'match') return themeDecor.value.confetti ?? 'plain'
  return value
}

// Sun to Sat on the preview's week; four trained days.
const WEEK = [true, false, true, true, false, true, false]
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const PIECES = ['accent', 'highlight', 'secondary', 'success', 'accent', 'secondary', 'highlight']
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="extras-title">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <button type="button" class="sheet-back" aria-label="Back to Theme" @click="emit('back')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6"></path>
        </svg>
      </button>
      <h3 id="extras-title" class="sheet-title">{{ info.title }}</h3>
      <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
    <p class="note">{{ info.blurb }}</p>

    <div class="opts" role="group" :aria-labelledby="'extras-title'">
      <template v-for="option in options" :key="option.value">
        <button
          type="button"
          class="opt"
          :class="{
            selected: current === option.value,
            locked: !option.unlocked,
            trying: trying === option.value,
          }"
          :aria-label="
            option.unlocked ? option.name : isPremium ? `${option.name}, locked, unlocks at ${rule(option.reward!)}` : `${option.name}, Premium`
          "
          :aria-pressed="current === option.value"
          :data-testid="`extra-${kind}-${option.value}`"
          @click="tap(option)"
        >
          <span class="opt-main">
            <span v-if="kind === 'weekMark'" class="swatch marks" aria-hidden="true">
              <DayMark v-for="i in 3" :key="i" :mark="markFor(option.value)" />
            </span>
            <span v-else-if="kind === 'confetti'" class="swatch pieces" :data-shape="confettiFor(option.value)" aria-hidden="true">
              <i v-for="(c, i) in PIECES.slice(0, 3)" :key="i" :style="{ background: `var(--${c})` }"></i>
            </span>
            <span v-else-if="isSound" class="swatch icon" aria-hidden="true">
              <svg v-if="option.value === 'off'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9l4 6M21 9l-4 6" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z" /></svg>
            </span>
            <span class="opt-text">
              <span class="opt-label">{{ option.name }}</span>
              <span v-if="kind === 'lines'" class="opt-caption">“{{ sampleLine(option.value) }}”</span>
            </span>
          </span>
          <span v-if="!option.unlocked && !isPremium" class="premium-tag" aria-hidden="true">Premium</span>
          <span v-else-if="!option.unlocked" class="unlock" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
              <path d="M7 10V7.5a5 5 0 0110 0V10h1a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8a2 2 0 012-2zm2.5 0h5V7.5a2.5 2.5 0 00-5 0z" />
            </svg>
            {{ rule(option.reward!) }}
          </span>
          <span v-else-if="current === option.value" class="check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </button>

        <div
          v-if="trying === option.value && option.reward"
          class="peek"
          role="group"
          :aria-label="`${option.name} preview`"
          data-testid="extra-preview"
        >
          <div v-if="kind === 'weekMark'" class="week" aria-hidden="true">
            <span v-for="(done, i) in WEEK" :key="i" class="wd">
              <span class="dot" :class="{ done }"><DayMark v-if="done" :mark="markFor(option.value)" /></span>
              {{ LETTERS[i] }}
            </span>
          </div>
          <div v-else-if="kind === 'confetti'" class="fall pieces" :data-shape="option.value" aria-hidden="true">
            <i v-for="(c, i) in PIECES" :key="i" :style="{ background: `var(--${c})`, left: `${8 + i * 13}%`, animationDelay: `${(i % 4) * 0.25}s` }"></i>
          </div>
          <ul v-else-if="kind === 'lines'" class="lines">
            <li v-for="line in personalitySamples(option.value)" :key="line">“{{ line }}”</li>
          </ul>
          <p v-else class="peek-text">Tap it again to hear it.</p>
          <button v-if="!isPremium" type="button" class="keep" @click="openPremiumSheet('extras')">Keep it with Premium</button>
          <template v-else-if="progress(option.reward)">
            <div class="bar" aria-hidden="true"><i :style="{ width: `${progress(option.reward)!.pct}%` }"></i></div>
            <p class="peek-text" data-testid="extra-progress">
              <strong>{{ progress(option.reward)!.text }}</strong> {{ progress(option.reward)!.more }}
            </p>
          </template>
        </div>
      </template>
    </div>
    <p v-if="warnLoud" class="note" data-testid="extra-loud-warning">These are louder than Classic. Try one at low volume before the gym.</p>
  </div>
</template>

<style scoped>
.sheet {
  width: 100%;
  max-width: 480px;
  max-height: min(88vh, var(--sheet-max-h, 88vh));
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet > * {
  flex-shrink: 0;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sheet-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

.sheet-back,
.sheet-close {
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sheet-close {
  color: var(--text-dim);
}

.note {
  margin: 0 2px;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.opts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.opt {
  min-height: 56px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
  color: var(--text);
}

.opt:active {
  transform: none;
  background: var(--surface-2);
}

.opt.selected {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.opt.trying {
  border-color: var(--secondary);
  box-shadow: inset 0 0 0 1px var(--secondary);
}

.opt-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.opt.locked .opt-main {
  opacity: 0.5;
}

.opt-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.opt-label {
  font-size: 0.9rem;
  font-weight: 700;
}

.opt.selected .opt-label {
  color: var(--accent);
}

.opt-caption {
  margin-top: 1px;
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex-shrink: 0;
  min-width: 52px;
  height: 28px;
  padding: 0 7px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
}

.marks :deep(.day-mark) {
  width: 13px;
  height: 13px;
}

.marks :deep(.candy-corn),
.marks :deep(.maple-leaf),
.marks :deep(.carrot),
.marks :deep(.candy-cane),
.marks :deep(.candy-heart) {
  width: 15px;
  height: 15px;
}

/* Confetti pieces: squares and dots by default, the theme's art, or an
   Extras shape as a mask so each piece keeps its color. */
.pieces i {
  display: block;
  width: 7px;
  height: 10px;
  border-radius: 2px;
}

.pieces i:nth-child(2n) {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.pieces[data-shape='hearts'] i,
.pieces[data-shape='stars'] i,
.pieces[data-shape='plates'] i,
.pieces[data-shape='candy-corn'] i,
.pieces[data-shape='carrot'] i,
.pieces[data-shape='candy-cane'] i,
.pieces[data-shape='candy-heart'] i,
.pieces[data-shape='leaves'] i {
  width: 12px;
  height: 12px;
  border-radius: 0;
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

.pieces[data-shape='candy-corn'] i {
  background: var(--decor-candy-corn) no-repeat center / contain !important;
}

.pieces[data-shape='carrot'] i {
  background: var(--decor-carrot) no-repeat center / contain !important;
}

.pieces[data-shape='candy-cane'] i {
  background: var(--decor-candy-cane) no-repeat center / contain !important;
}

.pieces[data-shape='candy-heart'] i {
  background: var(--decor-candy-heart) no-repeat center / contain !important;
}

.pieces[data-shape='leaves'] i {
  background: var(--decor-maple-leaf) no-repeat center / contain !important;
}

.unlock {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 800;
  color: var(--text-dim);
  white-space: nowrap;
}

/* Same look as the Premium tags on the Theme screen (#190). */
.premium-tag {
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 16%, transparent);
  color: var(--secondary);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.keep {
  min-height: 46px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.keep:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.check {
  color: var(--accent);
  flex-shrink: 0;
  display: flex;
}

.peek {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--secondary);
  border-radius: 14px;
}

.week {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.wd {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--text-dim);
}

.dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--text) 9%, transparent);
}

.dot.done {
  background: none;
}

.fall {
  position: relative;
  height: 72px;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.fall i {
  position: absolute;
  top: -14px;
  animation: extras-fall 1.6s linear infinite;
}

@keyframes extras-fall {
  from {
    transform: translateY(0) rotate(0deg);
  }
  to {
    transform: translateY(96px) rotate(200deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fall i {
    animation: none;
    top: 28px;
  }
}

.lines {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text);
}

.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--secondary);
}

.peek-text {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.peek-text strong {
  color: var(--text);
}
</style>
