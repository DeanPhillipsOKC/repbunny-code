<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { FREE_TEMPLATE_LIMIT, PREMIUM_INCLUDES as INCLUDES, unlockIfAlreadyOwned, type PremiumFeature } from '../lib/premium'
import { GUIDES_URL } from '../lib/whatsNew'
import PremiumUnlockActions from './PremiumUnlockActions.vue'

// Issue #104: opened in place of a locked feature (lib/premium.ts). Names
// what was tapped, lists what Premium includes, and never pushes: the store's
// price only on the button (#105), no countdown, one quiet way out.
const props = defineProps<{ feature: PremiumFeature }>()
const emit = defineEmits<{ dismiss: [] }>()

// Issue #116: a feature with a how-to guide on repbunny.app links it, so
// people can see how it works before unlocking.
const COPY: Record<PremiumFeature, { title: string; body: string; guide?: string }> = {
  templates: {
    title: 'Unlimited routines',
    body: `Free includes ${FREE_TEMPLATE_LIMIT} routines. Archive one to make room, or unlock Premium to keep as many as you like.`,
  },
  programs: {
    title: 'Bigger starter programs',
    body: `Programs that fit in ${FREE_TEMPLATE_LIMIT} routines are free. The machine 6-day split and the body-part split each add 5, so they come with Premium's unlimited routines. They're yours to change, and they stay if Premium ends.`,
    guide: 'starter-programs/',
  },
  plates: {
    title: 'Plate calculator',
    body: 'See which plates go on each side of the bar for any weight, with your gym\'s plates.',
    guide: 'plate-calculator/',
  },
  swap: {
    title: 'Swap suggestions',
    body: 'Machine taken? Get close alternatives for the same muscles, with what you lifted last time, and swap one in for this workout.',
  },
  progress: {
    title: 'Lift progress analytics',
    body: 'See your est. 1RM and volume, a year or all time of a lift at once, your best reps at each weight, and a calendar of every training day in the last 12 months. Heaviest over 1 or 3 months stays free.',
    guide: 'exercise-history/',
  },
  reports: {
    title: 'Monthly reports',
    body: 'Each month in one screen: workouts, sets, volume, records, your biggest est. 1RM gains, and the muscles you trained most, next to the month before. Plus a recap of your whole year. This week\'s numbers stay free.',
    guide: 'progress-reports/',
  },
  targets: {
    title: 'Next-set targets',
    body: 'A target for your next set that adjusts to how hard the last one felt (RPE), and offers a lighter week when a lift stalls. The plain Next time card stays free.',
  },
  strength: {
    title: 'Strength levels',
    body: 'See where your main lifts stand for your body weight, from Beginner to Elite: barbell, dumbbell, machine, and bodyweight squats, presses, deadlifts, rows, and pull-ups. Plus how far each is from the next level, and one overall score.',
    guide: 'strength-levels/',
  },
  themes: {
    title: 'Themes',
    body: 'Give the whole app a new look, some with their own bunny, and matching app icons. What you tried stays on once you unlock.',
    guide: 'themes/',
  },
  widgets: {
    title: 'Home screen widgets',
    body: 'See this week, start your next workout, and your latest record right from the home screen, in your theme\'s colors.',
    guide: 'home-screen-widgets/',
  },
  extras: {
    title: 'Extras',
    body: 'Rest chimes, record fanfares, confetti, week marks, and bunny personalities, earned by training. With Premium, every milestone you already reached unlocks its Extra right away.',
    guide: 'extras/',
  },
}

const copy = computed(() => COPY[props.feature])
const guideUrl = computed(() => (copy.value.guide ? GUIDES_URL + copy.value.guide : null))

// Set once the sheet closes: an unlock check that lands after that stays quiet.
let closed = false

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('dismiss')
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  void unlockIfAlreadyOwned().then((owned) => {
    if (owned && !closed) emit('dismiss')
  })
})
onUnmounted(() => {
  closed = true
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="sheet-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Premium" aria-describedby="premium-body">
      <div class="sheet-handle" aria-hidden="true"></div>

      <div class="head">
        <span class="eyebrow">Premium</span>
        <h3 class="sheet-title">{{ copy.title }}</h3>
        <p id="premium-body" class="sheet-sub">{{ copy.body }}</p>
        <a v-if="guideUrl" class="guide-link" :href="guideUrl" target="_blank" rel="noopener">
          See how it works<span aria-hidden="true"> ↗</span>
        </a>
      </div>

      <section class="includes" aria-labelledby="premium-includes-title">
        <h4 id="premium-includes-title" class="includes-title">Premium includes</h4>
        <ul class="includes-list">
          <li v-for="item in INCLUDES" :key="item.label" :class="{ current: item.feature === feature }">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ item.label }}
          </li>
        </ul>
        <p class="free-note">One-time unlock. Logging, history, backup, restore, and export stay free forever.</p>
      </section>

      <PremiumUnlockActions variant="sheet" @unlocked="emit('dismiss')" />
      <button type="button" class="ghost" @click="emit('dismiss')">Not now</button>
    </div>
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  /* Above every overlay it can be opened from (#132: exercise history). */
  z-index: 80;
  background: rgba(0, 0, 0, 0.5);
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
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 18px calc(18px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.eyebrow {
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 16%, transparent);
  color: var(--secondary);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sheet-title {
  margin: 2px 0 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

.sheet-sub {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.guide-link {
  padding: 2px 0;
  color: var(--secondary);
  font-size: 0.86rem;
  font-weight: 800;
  text-decoration: none;
}

.includes {
  padding: 12px 14px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.includes-title {
  margin: 0 0 8px;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-dim);
  text-transform: none;
  letter-spacing: normal;
}

.includes-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.includes-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.92rem;
  color: var(--text);
}

.includes-list svg {
  flex-shrink: 0;
  color: var(--secondary);
}

.includes-list li.current {
  font-weight: 800;
}

.includes-list li.current svg {
  color: var(--accent);
}

.free-note {
  margin: 12px 0 0;
  font-size: 0.76rem;
  color: var(--text-dim);
}

.ghost {
  width: 100%;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}
</style>
