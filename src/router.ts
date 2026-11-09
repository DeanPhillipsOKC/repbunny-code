import { createRouter, createWebHistory } from 'vue-router'
import BodyScreen from './components/BodyScreen.vue'
import ExerciseList from './components/ExerciseList.vue'
import LibraryLinkReview from './components/LibraryLinkReview.vue'
import LibraryExerciseDetail from './components/LibraryExerciseDetail.vue'
import LiftProgress from './components/LiftProgress.vue'
import MilestonesScreen from './components/MilestonesScreen.vue'
import MuscleCheckScreen from './components/MuscleCheckScreen.vue'
import MuscleDetail from './components/MuscleDetail.vue'
import MuscleProgress from './components/MuscleProgress.vue'
import ProgressHub from './components/ProgressHub.vue'
import PushPullCheck from './components/PushPullCheck.vue'
import ProgressReport from './components/ProgressReport.vue'
import StrengthLevels from './components/StrengthLevels.vue'
import TemplateEditor from './components/TemplateEditor.vue'
import TemplateManager from './components/TemplateManager.vue'
import TemplateProgress from './components/TemplateProgress.vue'
import TemplateProgressDetail from './components/TemplateProgressDetail.vue'
import TrainingCalendar from './components/TrainingCalendar.vue'
import WorkoutHistory from './components/WorkoutHistory.vue'
import WorkoutLogger from './components/WorkoutLogger.vue'

// Real routes (rather than a `view` ref App.vue swapped in place) so every
// in-app navigation pushes a browser history entry — without that, there was
// only ever the one entry from initial load, so a back-swipe/gesture had
// nowhere to go but out of the app. Route `name`s double as the View type
// BottomNav.vue's active-tab highlighting keys off.
export type View =
  | 'home'
  | 'exercises'
  | 'exercise-check'
  | 'push-pull-check'
  | 'library-link'
  | 'library-exercise'
  | 'templates'
  | 'template-edit'
  | 'progress'
  | 'workout-log'
  | 'lift-progress'
  | 'muscle-progress'
  | 'muscle-detail'
  | 'milestones'
  | 'progress-report'
  | 'strength-levels'
  | 'template-progress'
  | 'template-progress-detail'
  | 'training-calendar'
  | 'body'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: WorkoutLogger },
    // Issue #44: the Progress tab replaced History (now the Workout log tile)
    // and Body (now the Body weight tile, path unchanged).
    { path: '/progress', name: 'progress', component: ProgressHub },
    { path: '/progress/workouts', name: 'workout-log', component: WorkoutHistory },
    { path: '/progress/lifts', name: 'lift-progress', component: LiftProgress },
    // Issue #40: sets per week per muscle group, then one muscle over time.
    { path: '/progress/muscles', name: 'muscle-progress', component: MuscleProgress },
    { path: '/progress/muscles/:group', name: 'muscle-detail', component: MuscleDetail },
    // Issue #153.
    { path: '/progress/milestones', name: 'milestones', component: MilestonesScreen },
    // Issue #134: ?month=2026-09 or ?year=2025; no query is the month just ended.
    { path: '/progress/report', name: 'progress-report', component: ProgressReport },
    // Issue #136.
    { path: '/progress/strength', name: 'strength-levels', component: StrengthLevels },
    // Issue #157: total volume per session, routine by routine.
    { path: '/progress/templates', name: 'template-progress', component: TemplateProgress },
    { path: '/progress/templates/:id', name: 'template-progress-detail', component: TemplateProgressDetail },
    // Issue #137: the last 12 months, one square per day.
    { path: '/progress/calendar', name: 'training-calendar', component: TrainingCalendar },
    // Old links still land somewhere sensible.
    { path: '/history', redirect: { name: 'workout-log' } },
    { path: '/templates', name: 'templates', component: TemplateManager },
    // Issue #6: full-screen template editor, replacing the inline expand.
    { path: '/templates/:id', name: 'template-edit', component: TemplateEditor },
    { path: '/exercises', name: 'exercises', component: ExerciseList },
    // Issue #42: the one-time "check your exercises" screen. App.vue opens it
    // automatically once per device; the Exercises tab links to it after.
    { path: '/exercises/check', name: 'exercise-check', component: MuscleCheckScreen },
    // Issue #173: push or pull for the exercises Balance can't place yet.
    { path: '/exercises/push-pull', name: 'push-pull-check', component: PushPullCheck },
    // Linking existing exercises to the library (follow-up to #136). ?for=strength
    // lists only the ones that would get a strength level.
    { path: '/exercises/link', name: 'library-link', component: LibraryLinkReview },
    // Issue #39: one starter-library entry.
    { path: '/exercises/library/:id', name: 'library-exercise', component: LibraryExerciseDetail },
    // Backlog item 77.
    { path: '/body', name: 'body', component: BodyScreen },
  ],
})
