import { test, expect, type Page } from '@playwright/test'

// Issue #150: swap suggestion ranking (src/lib/exerciseSwap.ts). These run
// the module in the page against the dev server rather than in Playwright's
// Node process like the other *-unit specs, because it imports the bundled
// library JSON, which Node won't import without an import attribute.

type Ex = [id: string, name: string, muscle: string | null, libraryId: string | null, loadType?: string]

interface Scenario {
  current: Ex
  exercises: Ex[]
  excludeIds?: string[]
  loggedIds?: string[]
  limit?: number
  broad?: boolean
}

interface Ranked {
  name: string
  exerciseId: string | null
  entryGroup: string | null
  loggedBefore: boolean
  sameMovement: boolean
  sameEquipment: boolean
  movement: string | null
  reason: string
}

async function rank(page: Page, scenario: Scenario): Promise<Ranked[]> {
  return page.evaluate(async (s) => {
    const { rankSwapOptions, swapReason } = await window.__rbImport('/src/lib/exerciseSwap.ts')
    const toExercise = ([id, name, muscle_group, library_id, load_type]: Ex) => ({
      id,
      name,
      muscle_group,
      library_id,
      load_type: load_type ?? 'weight',
    })
    return rankSwapOptions({
      current: toExercise(s.current),
      exercises: s.exercises.map(toExercise),
      excludeIds: s.excludeIds ?? [],
      loggedIds: new Set(s.loggedIds ?? []),
      limit: s.limit,
      broad: s.broad,
    }).map((o: any) => ({
      name: o.name,
      exerciseId: o.exerciseId,
      entryGroup: o.entry?.muscleGroup ?? null,
      movement: o.entry?.movement ?? null,
      loggedBefore: o.loggedBefore,
      sameMovement: o.sameMovement,
      sameEquipment: o.sameEquipment,
      reason: swapReason(o),
    }))
  }, scenario as any)
}

async function libraryCount(page: Page, group: string, movements: string[]): Promise<number> {
  return page.evaluate(async ([g, m]) => {
    const { EXERCISE_LIBRARY } = await window.__rbImport('/src/lib/exerciseLibrary.ts')
    return EXERCISE_LIBRARY.filter((e: { muscleGroup: string; movement: string }) => e.muscleGroup === g && m.includes(e.movement)).length
  }, [group, movements] as const)
}

const QUADS = ['squat', 'lunge', 'leg_extension', 'jump']

const LEG_PRESS: Ex = ['lp', 'Leg Press', 'legs', 'leg_press']
const HACK_SQUAT: Ex = ['hs', 'Hack Squat', 'legs', 'hack_squat']
const LEG_EXTENSION: Ex = ['le', 'Leg Extension', 'legs', 'leg_extension']
const BENCH: Ex = ['bp', 'Barbell Bench Press', 'chest', 'barbell_bench_press']

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('swap ranking: same movement first, then logged before, then same equipment', async ({ page }) => {
  const options = await rank(page, {
    current: LEG_PRESS,
    exercises: [LEG_PRESS, HACK_SQUAT, LEG_EXTENSION, BENCH],
    loggedIds: ['le'],
  })
  expect(options).toHaveLength(6)
  // Hack Squat: same movement (squat) and equipment (machine), owned. Ties
  // go alphabetical, so the owned one comes before the library's.
  expect(options[0]).toMatchObject({ name: 'Hack Squat', exerciseId: 'hs', sameMovement: true, sameEquipment: true })
  // Then the library's other machine squats, alphabetical among equal scores.
  expect(options.slice(1, 4).map((o) => o.name)).toEqual(['Narrow-Stance Leg Press', 'Pendulum Squat', 'Single-Leg Leg Press'])
  for (const option of options.slice(1, 4)) {
    expect(option).toMatchObject({ exerciseId: null, sameMovement: true, sameEquipment: true })
  }
  // Then the library squats on other equipment.
  expect(options.slice(4, 6).map((o) => o.name)).toEqual(['Barbell Back Squat', 'Barbell Hack Squat'])
  for (const option of options.slice(4)) expect(option).toMatchObject({ sameMovement: true, sameEquipment: false })
  for (const option of options) expect(option.entryGroup).toBe('legs')
  expect(options.some((o) => o.name === 'Barbell Bench Press')).toBe(false)
})

test('swap ranking: a logged exercise outranks one that only shares equipment', async ({ page }) => {
  const options = await rank(page, {
    current: LEG_EXTENSION,
    exercises: [LEG_EXTENSION, ['lu', 'Lunge', 'legs', 'lunge', 'bodyweight'], ['lc', 'Seated Leg Curl', 'legs', 'seated_leg_curl']],
    loggedIds: ['lu'],
  })
  // The other leg extension comes first, then logged before beats same equipment.
  expect(options[0]).toMatchObject({ name: 'Single-Leg Leg Extension', sameMovement: true })
  expect(options[1]).toMatchObject({ name: 'Lunge', loggedBefore: true, sameMovement: false })
  // Seated Leg Curl is legs too, but hamstrings, not quads.
  expect(options.map((o) => o.name)).not.toContain('Seated Leg Curl')
  expect(options[2]).toMatchObject({ loggedBefore: false, sameMovement: false, sameEquipment: true })
})

test('swap ranking: the deck, the current exercise, and owned entries are never offered twice', async ({ page }) => {
  const options = await rank(page, {
    current: LEG_PRESS,
    exercises: [LEG_PRESS, HACK_SQUAT],
    excludeIds: ['hs'],
    limit: 50,
  })
  const names = options.map((o) => o.name)
  expect(names).not.toContain('Leg Press')
  expect(names).not.toContain('Hack Squat')
  expect(new Set(names).size).toBe(names.length)
  // Every quads entry in the library except the two owned ones.
  for (const option of options) expect(QUADS).toContain(option.movement)
  expect(options).toHaveLength((await libraryCount(page, 'legs', QUADS)) - 2)
})

test('swap ranking: custom exercises match by muscle group; no group, no suggestions', async ({ page }) => {
  const options = await rank(page, {
    current: LEG_PRESS,
    exercises: [LEG_PRESS, ['c1', 'My Squat Thing', 'legs', null]],
    loggedIds: ['c1'],
    limit: 50,
  })
  // "Squat" in its name makes it quads, like the Leg Press.
  const mine = options.find((o) => o.exerciseId === 'c1')!
  expect(mine).toMatchObject({ entryGroup: null, sameMovement: false, loggedBefore: true, reason: 'Your exercise' })

  const mystery: Ex = ['m1', 'Mystery Move', null, null]
  expect(await rank(page, { current: mystery, exercises: [mystery, LEG_PRESS] })).toEqual([])
})

test('swap ranking: a custom name that matches the library borrows its movement', async ({ page }) => {
  const named: Ex = ['n1', 'Bench Press', null, null]
  const options = await rank(page, { current: named, exercises: [named] })
  expect(options[0]).toMatchObject({ entryGroup: 'chest', sameMovement: true })
  expect(options[0].reason).toMatch(/^Same movement · /)
  expect(options.some((o) => o.name === 'Barbell Bench Press')).toBe(false)
})

test('swap ranking: a custom triceps lift gets triceps options, never curls', async ({ page }) => {
  // Not a library name ("Tricep Press" became a Seated Dip Machine alias), so
  // the target comes from the "tricep" name hint alone.
  const tricepPress: Ex = ['tp', 'Tricep Crusher', 'arms', null]
  const options = await rank(page, {
    current: tricepPress,
    exercises: [tricepPress, ['bc', 'Bicep Curl', 'arms', null], ['hc', 'Hammer Curl', 'arms', 'hammer_curl'], ['kb', 'Cable Kickback', 'arms', null]],
    loggedIds: ['bc', 'hc', 'kb'],
  })
  expect(options).toHaveLength(6)
  expect(options[0]).toMatchObject({ name: 'Cable Kickback', loggedBefore: true })
  for (const option of options.slice(1)) expect(['triceps_extension', 'dip', 'horizontal_press']).toContain(option.movement)
  expect(options.some((o) => /curl/i.test(o.name))).toBe(false)
})

test('swap ranking: an unknown target gives nothing until asked for the whole group', async ({ page }) => {
  const mystery: Ex = ['am', 'Arm Blaster 3000', 'arms', null]
  const curl: Ex = ['bc', 'Bicep Curl', 'arms', null]
  expect(await rank(page, { current: mystery, exercises: [mystery, curl] })).toEqual([])
  const broad = await rank(page, { current: mystery, exercises: [mystery, curl], loggedIds: ['bc'], broad: true })
  expect(broad[0].name).toBe('Bicep Curl')
  expect(broad).toHaveLength(6)
})
