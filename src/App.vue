<script setup lang="ts">
import { computed, KeepAlive, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AccountButton from './components/AccountButton.vue'
import AccountSheet from './components/AccountSheet.vue'
import BottomNav from './components/BottomNav.vue'
import PremiumSheet from './components/PremiumSheet.vue'
import ReportPrompt from './components/ReportPrompt.vue'
import TrialPassSheet from './components/TrialPassSheet.vue'
import RestMiniBar from './components/RestMiniBar.vue'
import SetupWizard from './components/SetupWizard.vue'
import { accountSheetOpen } from './lib/accountSheet'
import { setTrailNames } from './lib/actionTrail'
import { installHomeWidgets } from './lib/homeWidgets'
import { premiumSheetFeature, premiumToast } from './lib/premium'
import { trialSheetOpen } from './lib/trialPass'
import { isMuscleCheckDismissed } from './lib/muscleCheck'
import { isSetupDone, markSetupDone, setupWizardMode } from './lib/setupWizard'
import type { View } from './router'
import { useExercisesStore } from './stores/exercises'
import { useProfileStore } from './stores/profile'
import { useRestStore } from './stores/rest'
import { useTemplatesStore } from './stores/templates'
import { useWorkoutsStore } from './stores/workouts'
import WeightUnitSheet from './components/WeightUnitSheet.vue'

const route = useRoute()
const router = useRouter()

// #463: refreshed on navigation only, so a screen is never remounted mid-use.
const hubDay = ref(new Date().toDateString())
router.afterEach(() => {
  hubDay.value = new Date().toDateString()
})
const exercises = useExercisesStore()
const profile = useProfileStore()
const workout = useWorkoutsStore()
const rest = useRestStore()

// Issue #144: keeps the home screen widgets' snapshot current (native apps).
installHomeWidgets(router)

// Issue #234: the steps a bug report shows before an error. Taps on a row
// that shows the user's own exercise or routine name record "[name]".
const templates = useTemplatesStore()
// main.ts installs the trail itself.
setTrailNames(() => [...exercises.exercises.map((e) => e.name), ...templates.templates.map((t) => t.name)])

// route.name is typed `RouteRecordName | undefined` by vue-router; every
// route this app declares (router.ts) names itself with a View, so the cast
// is safe as long as that stays true.
const currentView = computed(() => (route.name as View) ?? 'home')

// Issue #65: these screens put Account on their own title row (PageHeader.vue;
// WorkoutLogger's compact header during a workout). The rest, which have no
// page title (one-time screens), keep the slim Account-only row below.
// Issue #276 added the routine editor and library exercise detail.
const OWN_HEADER_VIEWS = new Set<View>([
  'home',
  'exercises',
  'templates',
  'template-edit',
  'library-exercise',
  'progress',
  'workout-log',
  'lift-progress',
  'muscle-progress',
  'muscle-detail',
  'milestones',
  'progress-report',
  'strength-levels',
  'template-progress',
  'template-progress-detail',
  'training-calendar',
  'body',
])
const showAppHeader = computed(() => !OWN_HEADER_VIEWS.has(currentView.value))

// Issue #42: open the one-time "check your exercises" screen once per device,
// after the data loads, if any exercise still needs a muscle group. Not every
// screen fetches exercises on mount, so the app kicks off a fetch here.
// Decided once per launch so a later refetch never re-opens it; skipped
// mid-workout so it never interrupts logging (a later load retries).
let muscleCheckDecided = false

if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
if (!profile.fetched && !profile.loading) profile.fetchProfile()
if (!templates.fetched && !templates.loading) templates.fetchTemplates()

// Is there an unfinished workout to offer resuming? Checked once the screens
// have mounted (issue #938: this used to run from the sign-in gate).
onMounted(() => workout.checkForRecoverableWorkout())

// Issue #397: open the setup wizard once on a fresh install, decided once
// the exercises and routines have loaded: none of either (archived ones
// count, and workouts can't exist without exercises) and no "setup done"
// flag. It also waits for the profile (#406), so step 1 shows the saved unit
// and Skip never overwrites it. An account that already has data marks the flag, so emptying it
// later never brings the wizard back. A failed load decides nothing and
// leaves the unit sheet to ask as before.
const setupDecided = ref(isSetupDone())

watch(
  () =>
    [
      exercises.fetched,
      templates.fetched,
      profile.fetched,
      exercises.errorMessage,
      templates.errorMessage,
      profile.errorMessage,
    ] as const,
  ([exercisesFetched, templatesFetched, profileFetched, exercisesError, templatesError, profileError]) => {
    if (setupDecided.value) return
    if (exercisesError || templatesError || profileError) {
      setupDecided.value = true
      return
    }
    if (!exercisesFetched || !templatesFetched || !profileFetched) return
    setupDecided.value = true
    if (exercises.exercises.length > 0 || templates.templates.length > 0 || workout.activeWorkoutId) {
      markSetupDone()
    } else {
      setupWizardMode.value = 'first-run'
    }
  },
  { immediate: true },
)

watch(
  () => exercises.fetched,
  async (fetched) => {
    if (!fetched || muscleCheckDecided) return
    muscleCheckDecided = true
    if (isMuscleCheckDismissed() !== false) return
    if (!exercises.activeExercises.some((e) => !e.muscle_group)) return
    await router.isReady()
    if (route.name === 'exercise-check' || workout.activeWorkoutId) return
    router.push({ name: 'exercise-check' })
  },
)

// Issue #53: ask for the default weight unit once, as soon as the profile
// shows none picked. Held back mid-workout so it never interrupts logging;
// it appears once the workout ends.
// Issue #80: a rest keeps counting on the other tabs. Home shows its own bar
// (or the full screen) inside WorkoutLogger.
const showRestBar = computed(() => !!rest.activeRest && currentView.value !== 'home')

function resumeRest() {
  rest.minimized = false
  router.push({ name: 'home' })
}

// Issue #397: the setup wizard asks for the unit on a fresh install, so the
// sheet waits until that's decided and stays for anyone it left without one.
const showWeightUnitSheet = computed(
  () =>
    profile.fetched &&
    profile.weightUnit === null &&
    !workout.activeWorkoutId &&
    setupDecided.value &&
    !setupWizardMode.value,
)
</script>

<template>
  <main>
    <div class="status-bar-backdrop" aria-hidden="true"></div>
    <header v-if="showAppHeader" class="app-header">
      <AccountButton />
    </header>

    <ReportPrompt />
    <AccountSheet v-if="accountSheetOpen" @dismiss="accountSheetOpen = false" />
    <WeightUnitSheet v-if="showWeightUnitSheet" />
    <TrialPassSheet v-if="trialSheetOpen" @dismiss="trialSheetOpen = false" />
    <PremiumSheet v-if="premiumSheetFeature" :feature="premiumSheetFeature" @dismiss="premiumSheetFeature = null" />
    <div v-if="premiumToast" class="premium-toast" role="status">{{ premiumToast }}</div>
    <SetupWizard v-if="setupWizardMode" :mode="setupWizardMode" @done="setupWizardMode = null" />

    <section class="content">
      <!-- #463: the Progress hub derives its tiles over the whole history, so
           tab switches keep it mounted. The key renews it when the day rolls
           over (its week and month figures are read once per mount). -->
      <router-view v-slot="{ Component }">
        <KeepAlive include="ProgressHub">
          <component :is="Component" :key="hubDay" />
        </KeepAlive>
      </router-view>
    </section>

    <div v-if="showRestBar" class="rest-dock">
      <RestMiniBar @resume="resumeRest" @skip="rest.skip()" />
    </div>

    <BottomNav />
  </main>
</template>

<style scoped>
main {
  max-width: var(--page-max);
  margin: 0 auto;
  /* #880: clear of the notch side in landscape (0 in portrait). */
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  min-height: 100vh;
  /* Keeps the header out from under the status bar (--safe-top, style.css). */
  padding-top: var(--safe-top);
  /* Clears the fixed BottomNav (BottomNav.vue) so it never covers the
     footer or the last bit of scrollable content. */
  padding-bottom: calc(var(--bottom-nav-height) + 12px + env(safe-area-inset-bottom, 0px));
}

/* #827: the apps draw under the status bar, so scrolled content would show
   through the clock and Dynamic Island. This covers that strip in the theme's
   background; with no inset it has no height. Above the page and its docks,
   below sheets and dialogs (z-index 30 and up). */
.status-bar-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--safe-top);
  background: var(--bg);
  z-index: 25;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 16px 0;
}

.content {
  padding: 0 16px;
}

/* Same spot as WorkoutLogger's .bottom-dock: right on top of BottomNav. */
.rest-dock {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px));
  z-index: 20;
  max-width: var(--page-max);
  margin: 0 auto;
}

.premium-toast {
  position: fixed;
  top: calc(18px + var(--safe-top));
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 448px;
  z-index: 90;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--highlight) 14%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--highlight) 45%, var(--border));
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1.45;
  color: var(--text);
}
</style>
