<script setup lang="ts">
import { computed, ref } from 'vue'
import { hasPremium } from '../lib/premium'
import { activeTheme, chooseTheme, findTheme, outfitArt, resolveOutfit, THEMES, themeStyle, type Theme } from '../lib/theme'
import { currentTrial, setupTrialUsed, trialState } from '../lib/trialPass'

// Setup step 2 (#398, #886, reworked by #1002; mockup
// docs/design/issue-1002-look-step.html, option A). A Bunny art switch, then
// Classic and Chalk as cards, then every other theme as the same cards under
// a More themes accordion. Setup never leaves the step. A tap applies the
// theme to the whole app at once, so the wizard repaints: saved when it's
// free, held as a preview when it's Premium. Finishing setup on a Premium
// theme starts a one-time 7-day Themes trial (SetupWizard's close()).
const MAIN_IDS = ['classic', 'chalk']
const MAIN = MAIN_IDS.map(findTheme)
const MORE = THEMES.filter((t) => !MAIN_IDS.includes(t.id))

// The dots hint at the seasonal themes, in their own accents.
const DOTS = ['halloween', 'christmas', 'easter', 'carrot-patch'].map((id) => findTheme(id).tokens['--accent'])

const bunnyOn = computed(() => activeTheme.value.mascot === 'full')
const picked = computed(() => activeTheme.value.theme)
const morePick = computed(() => MORE.find((t) => t.id === picked.value) ?? null)

// Closed by default; open on its own when the pick is one of these themes.
const moreOpen = ref(morePick.value !== null)

// The one line at the top of the open accordion. Only when picking one there
// would start the setup trial; a Premium user (or a running Themes trial)
// just keeps the pick, so they see none.
const trialLine = computed(() => {
  if (hasPremium('themes')) return null
  if (!setupTrialUsed(trialState.value) && !currentTrial.value) {
    return "Pick one and it's yours free for 7 days. After that it comes with Premium, or you're back on Classic."
  }
  return 'These come with Premium. Pick one to try it on here.'
})

// Each card's art follows the switch: the theme's own celebration bunny when
// on, the small mark when off.
function bunnyArt(theme: Theme) {
  return outfitArt(resolveOutfit(theme, 'match'), 'celebration')
}

function toggleBunny() {
  chooseTheme({ mascot: bunnyOn.value ? 'minimal' : 'full' })
}
</script>

<template>
  <div class="look-step" role="group" aria-label="Look">
    <button
      type="button"
      role="switch"
      class="switch-row"
      :aria-checked="bunnyOn"
      aria-label="Bunny art"
      aria-describedby="bunny-art-caption"
      @click="toggleBunny"
    >
      <img v-if="bunnyOn" src="/heart-eyes-sticker.webp" alt="" class="face" width="34" height="34" />
      <img v-else src="/icon-512.png" alt="" class="face face-mark" width="34" height="34" />
      <span class="switch-text">
        <span class="switch-name">Bunny art</span>
        <span id="bunny-art-caption" class="switch-caption">{{
          bunnyOn ? 'The bunny cheers you on, with confetti for records.' : 'Off: just your numbers. Records still get a note.'
        }}</span>
      </span>
      <span class="toggle" :class="{ on: bunnyOn }" aria-hidden="true"></span>
    </button>

    <div class="grid">
      <button
        v-for="theme in MAIN"
        :key="theme.id"
        type="button"
        class="card"
        :class="{ on: picked === theme.id }"
        :aria-pressed="picked === theme.id"
        :aria-label="theme.label"
        @click="chooseTheme({ theme: theme.id })"
      >
        <span class="mini" :style="themeStyle(theme)" aria-hidden="true">
          <span class="mini-h"></span>
          <span class="mini-card"></span>
          <span class="mini-card"></span>
          <img v-if="bunnyOn" :src="bunnyArt(theme)" alt="" class="mini-bunny" />
          <template v-else>
            <span class="mini-card"></span>
            <img src="/icon-512.png" alt="" class="mini-mark" />
          </template>
          <span class="mini-btn"></span>
        </span>
        <span class="card-name">{{ theme.label }}</span>
        <span v-if="picked === theme.id" class="check" aria-hidden="true">✓</span>
      </button>
    </div>

    <div class="acc">
      <button
        type="button"
        class="acc-head"
        :aria-expanded="moreOpen"
        aria-controls="more-themes"
        @click="moreOpen = !moreOpen"
      >
        <span v-if="!morePick" class="dots" aria-hidden="true"><i v-for="color in DOTS" :key="color" :style="{ background: color }"></i></span>
        <span class="acc-text">
          <span class="acc-name">More themes</span>
          <span class="acc-sub">{{ morePick ? `${morePick.label} picked` : `${MORE.length} more, seasonal ones too` }}</span>
        </span>
        <span class="chev" :class="{ open: moreOpen }" aria-hidden="true">⌄</span>
      </button>
      <div v-if="moreOpen" id="more-themes" class="acc-body">
        <p v-if="trialLine" class="trial-line">{{ trialLine }}</p>
        <div class="grid">
          <button
            v-for="theme in MORE"
            :key="theme.id"
            type="button"
            class="card"
            :class="{ on: picked === theme.id }"
            :aria-pressed="picked === theme.id"
            :aria-label="theme.label"
            @click="chooseTheme({ theme: theme.id })"
          >
            <span class="mini" :style="themeStyle(theme)" aria-hidden="true">
              <span class="mini-h"></span>
              <span class="mini-card"></span>
              <span class="mini-card"></span>
              <img v-if="bunnyOn" :src="bunnyArt(theme)" alt="" class="mini-bunny" loading="lazy" />
              <template v-else>
                <span class="mini-card"></span>
                <img src="/icon-512.png" alt="" class="mini-mark" />
              </template>
              <span class="mini-btn"></span>
            </span>
            <span class="card-name">{{ theme.label }}</span>
            <span v-if="picked === theme.id" class="check" aria-hidden="true">✓</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.look-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Bunny art switch: the whole row is the control. */
.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 12px 14px;
  text-align: left;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.face {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
}

.face-mark {
  border-radius: 8px;
}

.switch-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.switch-name {
  font-weight: 800;
  font-size: 1rem;
}

.switch-caption {
  font-size: 0.78rem;
  color: var(--text-dim);
  line-height: 1.35;
}

.toggle {
  position: relative;
  width: 50px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 99px;
  background: var(--border);
  transition: background 0.15s;
}

.toggle::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: left 0.15s;
}

.toggle.on {
  background: var(--accent);
}

.toggle.on::after {
  left: 23px;
  background: var(--accent-text);
}

/* Theme cards, two per row. */
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.acc-body .grid {
  gap: 8px;
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  padding: 8px 8px 10px;
  text-align: left;
  border-radius: 16px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

.card.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent);
}

.card-name {
  padding: 0 2px;
  font-weight: 800;
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}

.check {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 24px;
  height: 24px;
  border-radius: 99px;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
  background: var(--accent);
  color: var(--accent-text);
}

/* A small Home drawn in the card's own theme (themeStyle sets its tokens). */
.mini {
  position: relative;
  display: block;
  height: 104px;
  overflow: hidden;
  border-radius: 10px;
  padding: 8px;
  background: var(--bg);
  border: 1px solid rgba(128, 128, 128, 0.18);
}

.mini-h {
  display: block;
  height: 6px;
  width: 46px;
  border-radius: 4px;
  margin-bottom: 7px;
  background: var(--text);
}

.mini-card {
  display: block;
  height: 22px;
  border-radius: 6px;
  margin-bottom: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.mini-btn {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  height: 11px;
  border-radius: 99px;
  background: var(--accent);
}

.mini-bunny {
  position: absolute;
  right: 6px;
  bottom: 16px;
  height: 62px;
}

.mini-mark {
  position: absolute;
  right: 8px;
  top: 6px;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  opacity: 0.9;
}

/* More themes accordion. */
.acc {
  border: 1px solid var(--border);
  border-radius: 14px;
}

.acc-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 10px 12px;
  text-align: left;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--text);
  font: inherit;
}

.acc-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.acc-name {
  font-size: 0.9rem;
  font-weight: 800;
}

.acc-sub {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-dim);
}

.chev {
  color: var(--text-dim);
  font-size: 1.1rem;
  transition: transform 0.15s;
}

.chev.open {
  transform: rotate(180deg);
}

.acc-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 10px 12px;
}

.trial-line {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.dots {
  display: flex;
  flex-shrink: 0;
}

.dots i {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--bg);
  margin-left: -5px;
}

.dots i:first-child {
  margin-left: 0;
}

@media (prefers-reduced-motion: reduce) {
  .toggle,
  .toggle::after,
  .chev {
    transition: none;
  }
}
</style>
