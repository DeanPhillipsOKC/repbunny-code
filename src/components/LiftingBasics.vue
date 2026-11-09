<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useProfileStore } from '../stores/profile'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #419 (design docs/design/new-to-lifting.html, approved 2026-10-13):
// "the basics" for people new to sets and reps, full screen. Five cards with
// Back, Next, and Done, and a swipe between them. Opened from the setup
// wizard's train step (option A, the link) and Account > About. Everything is
// drawn here, so it works offline. The last card offers a starter program;
// what that does is up to the screen that opened it.
withDefaults(defineProps<{ returnLabel?: string }>(), { returnLabel: 'Back to setup' })
const emit = defineEmits<{ done: []; startProgram: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('done'))

const profile = useProfileStore()
const unit = computed(() => profile.weightUnit ?? 'lb')
const weights = computed(() => (unit.value === 'kg' ? ['60', '60'] : ['135', '135']))

const CARDS = ['Reps and sets', 'Picking a weight', 'Rest', 'RPE', 'Logging a set'] as const
const index = ref(0)
const isLast = computed(() => index.value === CARDS.length - 1)
const heading = ref<HTMLElement | null>(null)

async function show(i: number) {
  index.value = Math.min(Math.max(i, 0), CARDS.length - 1)
  await nextTick()
  heading.value?.focus()
}

function back() {
  if (index.value === 0) emit('done')
  else show(index.value - 1)
}

// A sideways swipe pages; a mostly vertical one is a scroll.
let touchX = 0
let touchY = 0
function touchStart(event: TouchEvent) {
  touchX = event.touches[0]!.clientX
  touchY = event.touches[0]!.clientY
}
function touchEnd(event: TouchEvent) {
  const dx = event.changedTouches[0]!.clientX - touchX
  const dy = event.changedTouches[0]!.clientY - touchY
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  if (dx < 0 && !isLast.value) show(index.value + 1)
  else if (dx > 0 && index.value > 0) show(index.value - 1)
}

// Issue #426 (design docs/design/issue-426-lifting-basics-video.html, option
// A): a narrated video of the same ideas, for anyone who'd rather watch. The
// first card has a tile that opens it full screen, playing on that tap with
// sound and captions. The MP4 is in public/video/, so the native apps bundle
// it and it plays offline; scripts/demo-video/lifting-basics.mjs makes it.
const VIDEO = '/video/lifting-basics'
const playing = ref(false)
const video = ref<HTMLVideoElement | null>(null)
const watchTile = ref<HTMLElement | null>(null)

async function watch() {
  playing.value = true
  await nextTick()
  // Inside the tap, so the browser lets it play with sound.
  video.value?.play().catch(() => {})
}

async function closeVideo() {
  video.value?.pause()
  playing.value = false
  await nextTick()
  watchTile.value?.focus()
}

onMounted(() => heading.value?.focus())
</script>

<template>
  <div class="basics" role="dialog" aria-modal="true" aria-label="Lifting basics">
    <div class="screen">
      <div class="top">
        <button type="button" class="back" aria-label="Back" @click="back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <button type="button" class="done" @click="emit('done')">Done</button>
      </div>

      <button v-if="index === 0" ref="watchTile" type="button" class="watch" @click="watch">
        <span class="watch-thumb" aria-hidden="true">
          <img :src="`${VIDEO}.webp`" alt="" width="50" height="64" />
          <span class="watch-play"></span>
        </span>
        <span class="watch-text">
          <span class="watch-name">Watch the basics</span>
          <span class="watch-sub">1 min 30 s · sound on, captions</span>
        </span>
        <span class="watch-chev" aria-hidden="true">›</span>
      </button>

      <p class="step">The basics · {{ index + 1 }} of {{ CARDS.length }}</p>
      <h2 ref="heading" class="title" tabindex="-1">{{ CARDS[index] }}</h2>

      <div class="card" @touchstart.passive="touchStart" @touchend="touchEnd">
        <template v-if="index === 0">
          <p class="big" aria-hidden="true">3 × 8</p>
          <p class="center">means <b>3 sets of 8 reps</b></p>
          <p>A <b>rep</b> is one lift, like one squat. A <b>set</b> is a group of reps done back to back. Rest between sets, then go again.</p>
          <p>In RepBunny, each set you log is one row: the weight and how many reps you did.</p>
        </template>

        <template v-else-if="index === 1">
          <p>Start light enough that the <b>last rep or two feel hard</b> while your form holds.</p>
          <p>When all your sets start to feel easier, <b>add a little weight</b> next time.</p>
          <div class="tip">
            <span class="tip-icon" aria-hidden="true">!</span>
            <span><b>When unsure, go lighter.</b> You can always add weight on the next set.</span>
          </div>
        </template>

        <template v-else-if="index === 2">
          <p class="big" aria-hidden="true">1–3 min</p>
          <p class="center">of rest <b>between sets</b></p>
          <p>Rest about 1 to 3 minutes. Heavy lifts that use lots of muscle, like squats and deadlifts, need the longer end.</p>
          <p>In RepBunny, the <b>rest timer</b> starts when you add a set.</p>
        </template>

        <template v-else-if="index === 3">
          <p>RPE is <b>how hard a set felt</b>, from 1 to 10. A 10 means you couldn't do another rep.</p>
          <div class="scale" aria-hidden="true">
            <span v-for="n in [6, 7, 8, 9, 10]" :key="n" :class="{ on: n === 8 }">{{ n }}</span>
          </div>
          <p>A set where you could have done <b>about 2 more reps is RPE 8</b>.</p>
          <p>Logging RPE is optional. With Premium, next-set targets use it to pick your next weight.</p>
        </template>

        <template v-else>
          <p>Type the weight and reps for the set you just did, then tap <b>Add set</b>.</p>
          <div class="demo" role="img" :aria-label="`A set row with ${weights[1]} ${unit} for 8 reps and an Add set button, under a logged set`">
            <div class="demo-head" aria-hidden="true">
              <span>Set</span><span>{{ unit }}</span><span>Reps</span><span>RPE</span><span></span>
            </div>
            <div class="demo-row logged" aria-hidden="true">
              <span class="demo-n">1</span><span>{{ weights[0] }}</span><span>8</span><span>7</span>
              <span class="demo-check">✓</span>
            </div>
            <div class="demo-row" aria-hidden="true">
              <span class="demo-n">2</span><span class="demo-box">{{ weights[1] }}</span><span class="demo-box">8</span
              ><span class="demo-box dim">8</span>
              <span class="demo-add">Add set</span>
            </div>
          </div>
          <p>That's it. Not sure what to do? A starter program has the routines picked for you.</p>
        </template>
      </div>

      <div class="pager" aria-hidden="true">
        <i v-for="(card, i) in CARDS" :key="card" :class="{ on: i === index }"></i>
      </div>

      <template v-if="isLast">
        <button type="button" class="cta" @click="emit('startProgram')">Use a starter program</button>
        <button type="button" class="ghost" @click="emit('done')">{{ returnLabel }}</button>
      </template>
      <button v-else type="button" class="cta" @click="show(index + 1)">Next</button>
    </div>

    <div v-if="playing" class="player">
      <div class="player-top">
        <button type="button" class="player-back" @click="closeVideo">
          <span aria-hidden="true">‹</span> Back to the cards
        </button>
      </div>
      <video
        ref="video"
        class="player-video"
        :src="`${VIDEO}.mp4`"
        :poster="`${VIDEO}.webp`"
        controls
        playsinline
        preload="auto"
        aria-label="Lifting basics video: reps, sets, picking a weight, rest, RPE, a few gym words, and logging a set in RepBunny"
        @ended="closeVideo"
      >
        <track kind="captions" :src="`${VIDEO}.vtt`" srclang="en" label="English" default />
      </video>
    </div>
  </div>
</template>

<style scoped>
.basics {
  position: fixed;
  inset: 0;
  z-index: 70;
  overflow-y: auto;
  background: var(--bg);
  color: var(--text);
}

.screen {
  max-width: 480px;
  min-height: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: calc(18px + var(--safe-top)) 20px calc(24px + env(safe-area-inset-bottom, 0px));
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  margin-bottom: 18px;
}

.back {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  color: var(--text-dim);
  padding: 0;
}

.done {
  background: none;
  border: none;
  padding: 8px 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-dim);
}

.watch {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 0 0 16px;
  padding: 10px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  color: var(--text);
  text-align: left;
}

.watch-thumb {
  position: relative;
  width: 50px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface-2);
}

.watch-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.watch-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 28px;
  height: 28px;
  border-radius: 99px;
  background: var(--accent);
}

.watch-play::before {
  content: '';
  position: absolute;
  left: 10px;
  top: 8px;
  border-left: 10px solid var(--accent-text);
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
}

.watch-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.watch-name {
  font-weight: 800;
  font-size: 0.95rem;
}

.watch-sub {
  color: var(--text-dim);
  font-size: 0.78rem;
}

.watch-chev {
  color: var(--text-dim);
  font-weight: 800;
  font-size: 1.2rem;
}

/* The video, full screen over the cards, with its way back above it. */
.player {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  background: #000;
  padding: var(--safe-top) 0 env(safe-area-inset-bottom, 0px);
}

.player-top {
  padding: 10px 16px;
}

.player-back {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 9px 14px;
  color: var(--text);
  font-weight: 800;
  font-size: 0.86rem;
}

.player-video {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
  background: #000;
}

.step {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 0 0 4px;
}

.title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.6rem;
  line-height: 1.15;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  margin: 0;
  outline: none;
}

.card {
  flex: 1;
  min-height: 340px;
  margin-top: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card p {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--text-dim);
}

.card p b {
  color: var(--text);
}

.card .big {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 3rem;
  line-height: 1;
  text-align: center;
  color: var(--accent);
  margin-top: 10px;
}

.card .center {
  text-align: center;
}

.tip {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: color-mix(in srgb, var(--highlight) 8%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--highlight) 35%, var(--border));
  border-radius: 12px;
  padding: 12px;
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--text-dim);
}

.tip b {
  color: var(--text);
}

.tip-icon {
  width: 22px;
  height: 22px;
  border-radius: 99px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--highlight) 22%, transparent);
  color: var(--highlight);
  font-weight: 900;
  font-size: 0.8rem;
}

.scale {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.scale span {
  text-align: center;
  padding: 10px 0;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.2rem;
  color: var(--text-dim);
}

.scale span.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
}

/* A set row drawn in the current theme, like the workout screen's. */
.demo {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.demo-head,
.demo-row {
  display: grid;
  grid-template-columns: 26px 1fr 1fr 0.8fr 76px;
  gap: 6px;
  align-items: center;
  text-align: center;
}

.demo-head {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.demo-row {
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--text);
}

.demo-row.logged {
  color: var(--text-dim);
}

.demo-n {
  color: var(--text-dim);
  font-size: 0.82rem;
}

.demo-box {
  border: 1.5px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 8px 0;
}

.demo-box.dim {
  color: var(--text-dim);
}

.demo-check {
  color: var(--success);
  font-weight: 900;
}

.demo-add {
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.78rem;
  padding: 9px 0;
}

.pager {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin: 14px 0;
}

.pager i {
  width: 7px;
  height: 7px;
  border-radius: 99px;
  background: var(--border);
}

.pager i.on {
  width: 18px;
  background: var(--accent);
}

.cta {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
  font-size: 1rem;
  box-shadow: 0 14px 28px -14px var(--accent);
}

.cta:active {
  background: var(--accent-pressed);
}

.ghost {
  background: none;
  border: none;
  color: var(--text-dim);
  font-weight: 700;
  font-size: 0.88rem;
  padding: 14px 0 4px;
}
</style>
