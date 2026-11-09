import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { ref, watch } from 'vue'
import type { Router } from 'vue-router'
import { repos } from '../data'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { useExercisesStore } from '../stores/exercises'
import { useTemplatesStore } from '../stores/templates'
import { useWorkoutsStore } from '../stores/workouts'
import { isPremium, openPremiumSheet } from './premium'
import { TEMPLATE_CATEGORY_LABELS } from './templateCategory'
import { findTheme, ownedTheme } from './theme'
import { buildWidgetSnapshot, type WidgetSnapshot } from './widgetSnapshot'

// Issue #144 (Premium, native apps): home screen widgets for This week, Next
// workout, and Latest record. The app writes a JSON snapshot
// (lib/widgetSnapshot.ts) after each workout change, template change, and
// theme or Premium change, and when it goes to the background; the native
// side keeps it (SharedPreferences on Android, HomeWidgetsPlugin.java) and
// redraws the widgets from it. A tap on a widget comes back as a
// `widgetAction`: start a template, open the Premium sheet (the free
// placeholder), or open a screen. The iPhone's WidgetKit extension
// implements the same plugin once ios/ exists (#32).

export type WidgetAction =
  | { action: 'start'; templateId: string }
  | { action: 'premium' }
  | { action: 'open'; path: string }

export interface HomeWidgetsPlugin {
  update(options: { snapshot: string }): Promise<void>
  addListener(event: 'widgetAction', listener: (data: WidgetAction) => void): Promise<PluginListenerHandle>
  // Browser local mode only (the e2e suite): what the widgets were last
  // given, and a stand-in for a tap on one.
  getSnapshot?(): Promise<{ snapshot: string | null }>
  simulateTap?(options: WidgetAction): Promise<void>
}

const HomeWidgets = registerPlugin<HomeWidgetsPlugin>('HomeWidgets', {
  web: () => import('./homeWidgetsWeb').then((m) => new m.HomeWidgetsWeb()),
})

// The web stand-in counts as available so the e2e suite's browser local mode
// runs the same path.
export const homeWidgetsAvailable =
  Capacitor.getPlatform() === 'web' || Capacitor.isPluginAvailable('HomeWidgets')

// A Next workout tap, waiting for Home (WorkoutLogger.vue) to start it.
export const pendingWidgetStart = ref<string | null>(null)

// Workout store actions that change what a widget shows. fetchProgressStats
// runs after a restore or reset (refetchAccountData) and on Home.
const WORKOUT_ACTIONS = new Set([
  'finishWorkout',
  'deleteWorkout',
  'updateHistorySet',
  'addHistorySet',
  'deleteHistorySet',
  'resumeJustFinishedWorkout',
  'discardRecoverableWorkout',
  'fetchProgressStats',
])

async function buildSnapshot(): Promise<WidgetSnapshot | null> {
  const workouts = useWorkoutsStore()
  const exercises = useExercisesStore()
  const templates = useTemplatesStore()
  const bodyWeight = useBodyWeightStore()
  await Promise.all([
    exercises.fetched ? null : exercises.fetchExercises(),
    templates.fetched ? null : templates.fetchTemplates(),
    bodyWeight.fetched ? null : bodyWeight.fetchEntries(),
  ])
  const { data, error } = await repos.workouts.listProgressSets()
  if (error) return null
  const active = workouts.activeWorkoutId
  const loadTypes = new Map(exercises.exercises.map((e) => [e.id, e.load_type]))
  return buildWidgetSnapshot({
    now: new Date(),
    premium: isPremium.value,
    theme: findTheme(ownedTheme.value.theme),
    sets: data.filter((s) => s.workout_id !== active),
    templates: templates.activeTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      sub: TEMPLATE_CATEGORY_LABELS[templates.categoryOf(t)],
    })),
    exerciseNames: new Map(exercises.exercises.map((e) => [e.id, e.name])),
    loadTypeOf: (id) => loadTypes.get(id) ?? 'weight',
    bodyWeightEntries: bodyWeight.entries,
  })
}

// One write at a time; a widget that misses an update is never worth an error.
let queue: Promise<unknown> = Promise.resolve()

export function refreshHomeWidgets() {
  if (!homeWidgetsAvailable) return Promise.resolve()
  const next = queue
    .then(async () => {
      const snapshot = await buildSnapshot()
      if (snapshot) await HomeWidgets.update({ snapshot: JSON.stringify(snapshot) })
    })
    .catch(() => undefined)
  queue = next
  return next
}

let timer: ReturnType<typeof setTimeout> | undefined
function scheduleRefresh() {
  clearTimeout(timer)
  timer = setTimeout(refreshHomeWidgets, 300)
}

function handleAction(action: WidgetAction, router: Router) {
  if (action.action === 'premium') {
    router.push({ name: 'home' })
    openPremiumSheet('widgets')
  } else if (action.action === 'start') {
    pendingWidgetStart.value = action.templateId
    router.push({ name: 'home' })
  } else if (action.path.startsWith('/')) {
    router.push(action.path)
  }
}

// Called once from App.vue (inside the app, so the stores and router exist).
export function installHomeWidgets(router: Router) {
  if (!homeWidgetsAvailable) return
  useWorkoutsStore().$onAction(({ name, after }) => {
    if (WORKOUT_ACTIONS.has(name)) after(scheduleRefresh)
  })
  // Templates and exercise names as the widgets show them, so a fetch
  // landing late, a rename, or an archive all redraw.
  const templates = useTemplatesStore()
  const exercises = useExercisesStore()
  watch(
    () => [
      templates.activeTemplates.map((t) => `${t.id}:${t.name}:${templates.categoryOf(t)}`).join('|'),
      exercises.exercises.map((e) => `${e.id}:${e.name}`).join('|'),
    ],
    scheduleRefresh,
  )
  watch([isPremium, () => ownedTheme.value.theme], scheduleRefresh)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') refreshHomeWidgets()
  })
  HomeWidgets.addListener('widgetAction', (action) => handleAction(action, router)).catch(() => undefined)
  scheduleRefresh()
}

// For e2e specs, which reach this module with
// `await import('/src/lib/homeWidgets.ts')` against the dev server.
export async function readWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  await queue
  const raw = (await HomeWidgets.getSnapshot?.())?.snapshot
  return raw ? (JSON.parse(raw) as WidgetSnapshot) : null
}

export function simulateWidgetTap(action: WidgetAction) {
  return HomeWidgets.simulateTap?.(action)
}
