<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  deviceWeightUnit,
  markSetupDone,
  markSetupStartPicked,
  pendingSetupStart,
  type SetupStart,
  type SetupWizardMode,
} from '../lib/setupWizard'
import { GUIDES_URL } from '../lib/whatsNew'
import type { WeightUnit } from '../lib/types'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { useProfileStore } from '../stores/profile'
import { backupFolderAvailable } from '../lib/backupFolder'
import { settleSetupTheme } from '../lib/theme'
import LiftingBasics from './LiftingBasics.vue'
import SetupCopyStep from './SetupCopyStep.vue'
import SetupLookStep from './SetupLookStep.vue'
import SetupRestore from './SetupRestore.vue'

// Issue #397 (design docs/design/onboarding-wizard.html, approved 2026-10-12):
// the first-run setup wizard, full screen. A welcome screen, then the steps
// in STEPS, each with progress dots, Back, and Skip. The last step (#399)
// has no Done: each of its choices saves and finishes setup.
const props = defineProps<{ mode: SetupWizardMode }>()
const emit = defineEmits<{ done: [] }>()

const router = useRouter()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()

// #874: the automatic copy step, on the phone only (local mode).
type StepId = 'units' | 'look' | 'copy' | 'start'
const STEPS: StepId[] = backupFolderAvailable ? ['units', 'look', 'copy', 'start'] : ['units', 'look', 'start']

// A replay starts on the first step: the welcome is for new users.
const screen = ref<'welcome' | StepId>(props.mode === 'replay' ? STEPS[0]! : 'welcome')
const stepIndex = computed(() => (screen.value === 'welcome' ? -1 : STEPS.indexOf(screen.value)))
const isLastStep = computed(() => stepIndex.value === STEPS.length - 1)
const heading = ref<HTMLElement | null>(null)

// Step 1: preselected from the profile on a replay, else the phone's region.
const unit = ref<WeightUnit>(profile.weightUnit ?? deviceWeightUnit())
const bodyWeightDraft = ref<number | string | null>(null)
const UNITS: { unit: WeightUnit; name: string }[] = [
  { unit: 'lb', name: 'Pounds' },
  { unit: 'kg', name: 'Kilograms' },
]

// Step 3 (#399): how to train. Each choice finishes setup and goes straight
// to the same place as the matching #207 Home welcome card button. "See how"
// opens that feature's guide (with its short clip) in the browser; the clip
// lengths are the site's site/video/guides/*.mp4.
const STARTS: { id: SetupStart; icon: string; name: string; caption: string; guide: string; clip: string }[] = [
  {
    id: 'program',
    icon: '★',
    name: 'Use a starter program',
    caption: 'Not sure what to do? Get proven routines with how-tos for every lift.',
    guide: 'starter-programs/',
    clip: '12s',
  },
  {
    id: 'routine',
    icon: '✎',
    name: 'Create my own program',
    caption: 'Have a plan? Set up the routines you do each week, then start any of them in one tap.',
    guide: 'routines/',
    clip: '27s',
  },
  {
    id: 'log',
    icon: '+',
    name: 'Just log as I go',
    caption: 'Start a workout now and pick exercises as you do them.',
    guide: 'log-a-workout/',
    clip: '17s',
  },
]

// #419: "New to lifting?" under the choices opens the basics. Done comes
// back to this step unchanged; its starter program button is the same as
// the choice.
const basicsOpen = ref(false)
const basicsLink = ref<HTMLElement | null>(null)

async function closeBasics() {
  basicsOpen.value = false
  await nextTick()
  basicsLink.value?.focus()
}

function startFromBasics() {
  basicsOpen.value = false
  finish('program')
}

const busy = ref(false)
const errorMessage = ref('')

async function goTo(next: 'welcome' | StepId) {
  errorMessage.value = ''
  screen.value = next
  await nextTick()
  heading.value?.focus()
}

function back() {
  const i = stepIndex.value
  goTo(i <= 0 ? 'welcome' : STEPS[i - 1]!)
}

function next() {
  if (screen.value === 'units' && draftWeight() === undefined) {
    errorMessage.value = 'Enter your body weight, or leave it blank.'
    return
  }
  if (isLastStep.value) finish()
  else goTo(STEPS[stepIndex.value + 1]!)
}

// The body weight typed in step 1: null when blank, undefined when it isn't
// a weight, so it's caught before leaving the step.
function draftWeight(): number | null | undefined {
  const raw = bodyWeightDraft.value
  if (raw === null || raw === '') return null
  const weight = Number(raw)
  return weight > 0 && weight < 2000 ? weight : undefined
}

function close(start: SetupStart | null = null) {
  settleSetupTheme() // #1002: a Premium pick in step 2 starts its one-time trial
  markSetupDone()
  emit('done')
  if (start) markSetupStartPicked()
  if (start === 'program') {
    router.push({ name: 'templates', query: { programs: '1' } })
    return
  }
  pendingSetupStart.value = start
  if (router.currentRoute.value.name !== 'home') router.push({ name: 'home' })
}

// Skip keeps the defaults. On a first run that means saving a unit if none
// is picked yet (whatever step 1 shows: the region's, or the one tapped).
// A replay changes nothing. On the last step (#399) Skip only skips that
// step: the earlier ones were answered, so it saves them like a choice does. A failed save isn't worth stopping for: the
// one-time unit sheet (App.vue) still asks while the profile has none.
async function skip() {
  if (busy.value) return
  if (isLastStep.value) {
    finish()
    return
  }
  if (props.mode === 'first-run' && profile.weightUnit === null) {
    busy.value = true
    await profile.updateWeightUnit(unit.value)
    busy.value = false
  }
  close()
}

// Only ever changes the unit and adds a weigh-in; never deletes anything.
// The look (step 2) is saved when tapped, or a preview close() settles (#1002).
async function finish(start: SetupStart | null = null) {
  if (busy.value) return
  errorMessage.value = ''
  const weight = draftWeight() ?? null

  busy.value = true
  if (profile.weightUnit !== unit.value) {
    const { error } = await profile.updateWeightUnit(unit.value)
    if (error) {
      busy.value = false
      errorMessage.value = `Couldn't save that. ${error.message}`
      return
    }
  }
  if (weight !== null) {
    const { error } = await bodyWeight.logWeight(weight, unit.value)
    if (error) {
      busy.value = false
      errorMessage.value = `Couldn't save your body weight. ${error.message}`
      return
    }
  }
  busy.value = false
  close(start)
}
</script>

<template>
  <div class="wizard" role="dialog" aria-modal="true" aria-label="Set up RepBunny">
    <div v-if="screen === 'welcome'" class="screen welcome">
      <div class="hello">
        <img src="/onboarding-bunny.png" alt="" class="hello-art mascot-art" width="210" height="210" />
        <h1 ref="heading" class="wordmark" tabindex="-1">RepBunny</h1>
        <p class="tagline">Small wins. Stronger every set.</p>
        <ul class="promises">
          <li><span class="tick" aria-hidden="true">✓</span>Log a set in a couple of taps</li>
          <li><span class="tick" aria-hidden="true">✓</span>See every lift get stronger</li>
          <li><span class="tick" aria-hidden="true">✓</span>No account. Your data stays on your phone</li>
        </ul>
      </div>
      <!-- #431, #874: restoring from a copy or a file (SetupRestore.vue). -->
      <SetupRestore :busy="busy" @restored="close()">
        <button type="button" class="cta" @click="goTo(STEPS[0]!)">Set up in 30 seconds</button>
        <button type="button" class="ghost" :disabled="busy" @click="skip">Skip setup</button>
      </SetupRestore>
    </div>

    <div v-else class="screen">
      <div class="top">
        <button type="button" class="back" aria-label="Back" @click="back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div class="dots" aria-hidden="true">
          <i v-for="(id, i) in STEPS" :key="id" :class="{ on: i === stepIndex, done: i < stepIndex }"></i>
        </div>
        <button type="button" class="skip" :disabled="busy" @click="skip">Skip</button>
      </div>

      <p class="step">{{ STEPS.length > 1 ? `Step ${stepIndex + 1} of ${STEPS.length}` : 'Quick setup' }}</p>

      <template v-if="screen === 'units'">
        <h2 ref="heading" class="title" tabindex="-1">How do you measure?</h2>
        <p class="lede">New exercises start in this unit. You can switch any exercise later.</p>

        <p id="unit-label" class="label">I lift in</p>
        <div class="seg" role="group" aria-labelledby="unit-label">
          <button
            v-for="option in UNITS"
            :key="option.unit"
            type="button"
            :class="{ on: unit === option.unit }"
            :aria-pressed="unit === option.unit"
            :aria-label="option.unit"
            @click="unit = option.unit"
          >
            <b>{{ option.unit }}</b>
            <span>{{ option.name }}</span>
          </button>
        </div>

        <label for="setup-body-weight" class="label">Body weight <span class="optional">optional</span></label>
        <div class="field">
          <input
            id="setup-body-weight"
            v-model="bodyWeightDraft"
            type="number"
            inputmode="decimal"
            enterkeyhint="done"
            min="0"
            step="any"
            :placeholder="unit === 'kg' ? 'e.g. 80' : 'e.g. 180'"
            aria-describedby="setup-body-weight-why"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <span class="field-unit" aria-hidden="true">{{ unit }}</span>
        </div>
        <p id="setup-body-weight-why" class="why">
          Used for bodyweight exercises like pull-ups and dips, and for your Body tab. Leave it blank if you'd rather not.
        </p>

        <div class="lock">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span><b>Stays on this phone.</b> RepBunny has no account and never uploads your data.</span>
        </div>
      </template>

      <template v-else-if="screen === 'look'">
        <h2 ref="heading" class="title" tabindex="-1">Pick your look</h2>
        <p class="lede">Cute or all business. It's your call.</p>

        <SetupLookStep />
      </template>

      <template v-else-if="screen === 'copy'">
        <h2 ref="heading" class="title" tabindex="-1">Your workouts, kept safe</h2>
        <SetupCopyStep />
      </template>

      <template v-else-if="screen === 'start'">
        <h2 ref="heading" class="title" tabindex="-1">How do you want to train?</h2>

        <div class="explain">
          <p class="explain-q">Routines and programs</p>
          <p>
            A <b>routine</b> is a saved workout you repeat, like "Push day". Your <b>program</b> is the routines you do
            each week: one or several, depending on how you train.
          </p>
        </div>

        <div class="choices">
          <div v-for="start in STARTS" :key="start.id" class="choice">
            <button
              type="button"
              class="choice-btn"
              :aria-describedby="`start-${start.id}-caption`"
              :disabled="busy"
              @click="finish(start.id)"
            >
              <span class="choice-icon" aria-hidden="true">{{ start.icon }}</span>
              <span class="choice-text">
                <span class="choice-name">{{ start.name }}</span>
                <span :id="`start-${start.id}-caption`" class="choice-caption">{{ start.caption }}</span>
              </span>
              <svg class="choice-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <a
              class="how"
              :href="GUIDES_URL + start.guide"
              target="_blank"
              rel="noopener"
              :aria-label="`See how: ${start.name}, ${start.clip} clip`"
            >
              <i aria-hidden="true">▶</i>See how · {{ start.clip }}
            </a>
          </div>
        </div>

        <button ref="basicsLink" type="button" class="basics-link" :disabled="busy" @click="basicsOpen = true">
          <span class="basics-icon" aria-hidden="true">?</span>
          <span class="choice-text">
            <span class="basics-name">New to lifting? Learn the basics</span>
            <span class="choice-caption">Sets, reps, and picking a weight ·&nbsp;2&nbsp;min</span>
          </span>
          <svg class="choice-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </template>

      <div class="spacer"></div>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <p v-if="screen === 'start'" class="fine">{{ busy ? 'Saving…' : 'You can do all three. This just picks where to start.' }}</p>
      <button v-else type="button" class="cta" :disabled="busy" @click="next">
        {{ busy ? 'Saving…' : 'Next' }}
      </button>
    </div>

    <LiftingBasics v-if="basicsOpen" @done="closeBasics" @start-program="startFromBasics" />
  </div>
</template>

<style scoped>
.wizard {
  position: fixed;
  inset: 0;
  z-index: 60;
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

/* Welcome */
.welcome {
  background: radial-gradient(120% 60% at 50% 10%, color-mix(in srgb, var(--secondary) 16%, var(--bg)) 0%, var(--bg) 62%);
  max-width: none;
  align-items: center;
}

.welcome > * {
  width: 100%;
  max-width: 440px;
}

.hello {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px 0 20px;
}

.hello-art {
  width: 210px;
  height: 210px;
  object-fit: contain;
  filter: drop-shadow(0 16px 26px color-mix(in srgb, var(--shade) 50%, transparent));
}

.wordmark {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 2.2rem;
  margin: 14px 0 0;
  outline: none;
}

.tagline {
  color: var(--text-dim);
  font-style: italic;
  font-weight: 500;
  font-size: 0.95rem;
  margin: 4px 0 18px;
}

.promises {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}

.promises li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 11px 12px;
}

.tick {
  color: var(--highlight);
  font-weight: 800;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
}

/* Step chrome */
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

.dots {
  display: flex;
  gap: 6px;
}

.dots i {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: var(--border);
}

.dots i.on {
  width: 22px;
  background: var(--accent);
}

.dots i.done {
  background: color-mix(in srgb, var(--accent) 55%, var(--border));
}

.skip {
  width: 64px;
  text-align: right;
  background: none;
  border: none;
  padding: 8px 0;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-dim);
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

.lede {
  color: var(--text-dim);
  font-size: 0.9rem;
  line-height: 1.5;
  margin: 6px 0 18px;
}

/* Units */
.label {
  display: block;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-dim);
  margin: 0 0 8px;
}

.optional {
  font-weight: 600;
  font-size: 0.76rem;
  margin-left: 6px;
}

.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 22px;
}

.seg button {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 16px 12px;
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.seg button.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}

.seg b {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.6rem;
  line-height: 1;
}

.seg span {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
}

.field {
  display: flex;
  align-items: center;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 0 16px;
}

.field:focus-within {
  border-color: var(--accent);
}

.field input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  padding: 14px 0;
  color: var(--text);
  font: inherit;
  font-size: 1.1rem;
  font-weight: 700;
}

.field input::placeholder {
  color: var(--text-dim);
  opacity: 0.8;
}

.field-unit {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-dim);
}

.why {
  font-size: 0.78rem;
  color: var(--text-dim);
  line-height: 1.5;
  margin: 8px 2px 0;
}

.lock {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  margin-top: 18px;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.lock svg {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--highlight);
}

.lock b {
  color: var(--text);
}

/* How to train (#399) */
.explain {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 14px;
  margin: 14px 0;
}

.explain p {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--text-dim);
}

.explain p b {
  color: var(--text);
}

.explain .explain-q {
  font-weight: 800;
  font-size: 0.88rem;
  margin: 0 0 4px;
  color: var(--highlight);
}

.choices {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.choice {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 16px;
  padding: 13px 14px;
}

.choice-btn {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0;
  color: var(--text);
}

.choice-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
  font-size: 1.1rem;
  font-weight: 900;
}

.choice-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.choice-name {
  font-weight: 800;
  font-size: 0.98rem;
}

.choice-caption {
  font-size: 0.78rem;
  color: var(--text-dim);
  line-height: 1.4;
}

.choice-chevron {
  flex-shrink: 0;
  color: var(--text-dim);
}

.how {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0 52px;
  padding: 2px 0;
  font-size: 0.76rem;
  font-weight: 800;
  color: var(--accent);
  text-decoration: none;
}

.how i {
  width: 16px;
  height: 16px;
  border-radius: 99px;
  border: 1.5px solid var(--accent);
  display: grid;
  place-items: center;
  font-style: normal;
  font-size: 7px;
}

/* New to lifting? (#419): lighter than the choices, so it doesn't compete. */
.basics-link {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  margin-top: 14px;
  padding: 12px 14px;
  text-align: left;
  border-radius: 14px;
  border: 1.5px dashed color-mix(in srgb, var(--highlight) 60%, var(--border));
  background: color-mix(in srgb, var(--highlight) 8%, var(--surface));
  color: var(--text);
}

.basics-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--highlight) 22%, transparent);
  color: var(--highlight);
  font-weight: 900;
}

.basics-name {
  font-weight: 800;
  font-size: 0.9rem;
}

.fine {
  color: var(--text-dim);
  font-size: 0.76rem;
  line-height: 1.45;
  text-align: center;
  margin: 10px 0 0;
}

/* Shared */
.spacer {
  flex: 1;
  min-height: 24px;
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

.cta:disabled {
  opacity: 0.7;
}

.ghost {
  background: none;
  border: none;
  color: var(--text-dim);
  font-weight: 700;
  font-size: 0.88rem;
  padding: 14px 0 4px;
}

.error {
  color: var(--danger);
  font-size: 0.85rem;
  text-align: center;
  margin: 0 0 10px;
}
</style>
