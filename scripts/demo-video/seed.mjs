// Off-camera setup shared by the guide clips (guide-clips.mjs, #434, #433) and
// the sprint review clips (review/kit.mjs, #605). Local mode only: it restores
// a made-up history through the app's own backup restore, as the e2e specs
// seed local mode. Never real user data.

const DAY = 86_400_000

// Ten weeks of push / pull / legs on Mon, Wed, and Fri, ending on the last of
// those days at least 3 days back, with Push day last so the bench press
// leads the Lift progress list. Each lift adds a rep a session from its 10 to
// 12 rep range, then 5 or 10 lb, with RPE 7.5, 8, and 9 on its three sets.
export function history() {
  const lifts = [
    // id, name, muscle group, start weight, step, routine, barbell
    ['bench', 'Barbell Bench Press', 'chest', 130, 5, 'push', true],
    ['ohp', 'Overhead Press', 'shoulders', 75, 5, 'push', true],
    ['pushdown', 'Tricep Pushdown', 'arms', 40, 5, 'push', false],
    ['row', 'Barbell Row', 'back', 115, 5, 'pull', true],
    ['pulldown', 'Lat Pulldown', 'back', 100, 5, 'pull', false],
    ['curl', 'Dumbbell Curl', 'arms', 25, 5, 'pull', false],
    ['squat', 'Barbell Back Squat', 'legs', 165, 10, 'legs', true],
    ['rdl', 'Romanian Deadlift', 'legs', 135, 10, 'legs', true],
    ['legpress', 'Leg Press', 'legs', 230, 20, 'legs', false],
  ]
  const routines = { push: 'Push day', pull: 'Pull day', legs: 'Leg day' }
  const state = Object.fromEntries(lifts.map(([id, , , weight], i) => [id, { weight, reps: 10 + (i % 3) }]))
  const end = new Date()
  end.setHours(18, 0, 0, 0)
  const days = []
  for (let back = 3; days.length < 30; back++) {
    const day = new Date(end.getTime() - back * DAY)
    if ([1, 3, 5].includes(day.getDay())) days.unshift(day)
  }
  const workouts = []
  const sets = []
  days.forEach((day, i) => {
    const routine = ['push', 'legs', 'pull'][(days.length - 1 - i) % 3]
    const id = `w${i}`
    workouts.push({ id, performed_at: day.toISOString(), finished_at: new Date(day.getTime() + 55 * 60_000).toISOString(), template_id: routine, notes: null })
    let index = 0
    for (const [lift, , , , step, liftRoutine] of lifts) {
      if (liftRoutine !== routine) continue
      const s = state[lift]
      ;[s.reps, s.reps, s.reps - 1].forEach((reps, k) =>
        sets.push({ id: `${id}-${lift}-${k}`, workout_id: id, exercise_id: lift, set_index: index++, reps, weight: s.weight, weight_unit: 'lb', rpe: [7.5, 8, 9][k] }),
      )
      if (s.reps >= 12) Object.assign(s, { weight: s.weight + step, reps: 10 })
      else s.reps++
    }
  })
  return {
    format: 'repbunny-backup',
    version: 2,
    exported_at: new Date().toISOString(),
    exercises: lifts.map(([id, name, muscle_group, , , , uses_barbell]) => ({ id, name, muscle_group, also_works: [], load_type: 'weight', is_archived: false, uses_barbell })),
    workout_templates: Object.entries(routines).map(([id, name]) => ({ id, name, is_archived: false, category: null })),
    workout_template_exercises: lifts.map(([id, , , , , routine], i) => ({ id: `te-${id}`, template_id: routine, exercise_id: id, position: i % 3, target_sets: 3 })),
    workouts,
    sets,
    body_weight_entries: [],
  }
}

// Restores the history, turns Premium on when asked, and reloads onto Home.
// `edit` lets a clip change the backup first (for example, make the last
// workout freeform with `template_id = null`).
export async function seed(page, { premium = false, edit } = {}) {
  const backup = history()
  edit?.(backup)
  await page.evaluate(
    async ({ backup, premium }) => {
      const { repos } = await import('/src/data/index.ts')
      const { error } = await repos.backup.restore(backup)
      if (error) throw new Error(error.message)
      const { setPremiumUnlocked } = await import('/src/lib/premium.ts')
      setPremiumUnlocked(premium)
    },
    { backup, premium },
  )
  await page.reload()
  await page.getByText(/Push day|Start a workout/).first().waitFor()
}

// For mid-workout clips: the rest screen shows its source line rather than the
// one-time first-rest tip, and no "Rest alerts are off" box (headless Chromium
// reports notifications as blocked). With `rest: false`, no default rest
// either, so logging a set doesn't cover the clip's screen.
export async function quietRest(page, { rest = true } = {}) {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' })
    localStorage.setItem('rb-rest-tip-seen', '1')
  })
  if (!rest) await restOff(page)
}

// Turns the default rest off, off camera, so the next record gets the full celebration instead of
// the rest screen's badge. Needs a page on the app (the store is imported from the dev server).
export const restOff = (page) =>
  page.evaluate(async () => {
    const { useProfileStore } = await import('/src/stores/profile.ts')
    const { error } = await useProfileStore().updateDefaultRestSeconds(null)
    if (error) throw new Error(error.message)
  })
