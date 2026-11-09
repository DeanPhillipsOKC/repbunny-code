import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  buildImportPlan,
  detectApp,
  existingWorkoutKeys,
  inferLoadType,
  parseCsv,
  parseImport,
  parseImportDate,
  setRow,
  sourceExercises,
  warmupCount,
  type ImportTarget,
} from '../src/lib/importHistory'

// Issue #208: parsing Strong and Hevy exports and planning the import. The
// sample files are hand-built from each app's documented columns.

const strong = readFileSync('e2e/fixtures/imports/strong-sample.csv', 'utf8')
const hevy = readFileSync('e2e/fixtures/imports/hevy-sample.csv', 'utf8')

test('parseCsv handles quotes, escaped quotes, CRLF, a BOM, and semicolons', () => {
  expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
    ['a', 'b'],
    ['x, y', 'say "hi"'],
  ])
  expect(parseCsv('a;b\n1,5;2\n')).toEqual([
    ['a', 'b'],
    ['1,5', '2'],
  ])
})

test('detectApp tells Strong from Hevy, and parseImport refuses the wrong app', () => {
  expect(detectApp(strong)).toBe('strong')
  expect(detectApp(hevy)).toBe('hevy')
  expect(detectApp('date,exercise,set\n')).toBeNull()
  expect(parseImport(strong, 'hevy')).toBeNull()
  expect(parseImport(hevy, 'strong')).toBeNull()
})

test('dates parse as local time in both formats', () => {
  expect(parseImportDate('2024-03-04 18:05:32')).toBe(new Date(2024, 2, 4, 18, 5, 32).toISOString())
  expect(parseImportDate('4 Mar 2024, 18:05')).toBe(new Date(2024, 2, 4, 18, 5).toISOString())
  expect(parseImportDate('not a date')).toBeNull()
})

test('a Strong export: workouts, warm-ups, rest rows, assisted, timed, and unknown units', () => {
  const parsed = parseImport(strong, 'strong')!
  expect(parsed.workouts.map((w) => w.name)).toEqual(['Push Day', 'Pull Day', 'Push Day'])
  // The Rest Timer row isn't a set.
  expect(parsed.workouts[0].sets).toHaveLength(4)
  expect(parsed.workouts[0].notes).toBe('Felt strong')
  expect(parsed.workouts[0].exerciseNotes).toEqual([{ exercise: 'Bench Press (Barbell)', note: 'Pause at the bottom' }])
  expect(parsed.unitsKnown).toBe(false)
  expect(warmupCount(parsed)).toBe(1)
  const sources = sourceExercises(parsed)
  expect(sources.map((s) => [s.name, s.sets, s.loadType, s.tracksDistance])).toEqual([
    ['Bench Press (Barbell)', 4, 'weight', false],
    ['Pull Up (Assisted)', 2, 'assisted', false],
    ['Chest Fly (Band)', 1, 'bodyweight', false],
    ['Running (Treadmill)', 1, 'timed', true],
  ])
})

test('a Hevy export: kg, warm-ups, RPE, bodyweight, and timed', () => {
  const parsed = parseImport(hevy, 'hevy')!
  expect(parsed.unitsKnown).toBe(true)
  expect(parsed.workouts).toHaveLength(1)
  const [workout] = parsed.workouts
  expect(workout.notes).toBe('Good session')
  expect(workout.sets[1]).toMatchObject({ exercise: 'Squat (Barbell)', weight: 100, unit: 'kg', reps: 5, rpe: 8.5, warmup: false })
  expect(workout.sets[0].warmup).toBe(true)
  const types = Object.fromEntries(sourceExercises(parsed).map((s) => [s.name, s.loadType]))
  expect(types).toEqual({ 'Squat (Barbell)': 'weight', Plank: 'timed', 'Pull Up': 'bodyweight' })
})

test('inferLoadType reads the name when the sets are ambiguous', () => {
  const set = { exercise: 'x', warmup: false, weight: 20, unit: 'lb' as const, reps: 8, durationSeconds: null, distance: null, distanceUnit: null, rpe: null }
  expect(inferLoadType('Dip (Weighted)', [set]).loadType).toBe('bodyweight')
  expect(inferLoadType('Assisted Dip', [set]).loadType).toBe('assisted')
  expect(inferLoadType('Curl', [set]).loadType).toBe('weight')
})

test('setRow maps each load type and drops sets it can not store', () => {
  const base = { exercise: 'x', warmup: false, unit: null, durationSeconds: null, distance: null, distanceUnit: null, rpe: 7 }
  expect(setRow({ ...base, weight: 135, reps: 8 }, 'weight', false, 'lb')).toEqual({ reps: 8, weight: 135, weight_unit: 'lb', rpe: 7 })
  expect(setRow({ ...base, weight: -40, reps: 8 }, 'assisted', false, 'kg')).toMatchObject({ weight: 40, weight_unit: 'kg' })
  expect(setRow({ ...base, weight: 0, reps: 0 }, 'bodyweight', false, 'lb')).toBeNull()
  expect(setRow({ ...base, weight: 0, reps: 0, durationSeconds: 900, distance: 1.5 }, 'timed', true, 'lb')).toEqual({
    reps: null,
    weight: 0,
    weight_unit: 'lb',
    rpe: 7,
    duration_seconds: 900,
    distance: 1.5,
    distance_unit: 'mi',
  })
  expect(setRow({ ...base, weight: 0, reps: 0, durationSeconds: 900, distance: 1.5 }, 'timed', false, 'lb')).toMatchObject({ distance: null, distance_unit: null })
  expect(setRow({ ...base, weight: 0, reps: 0 }, 'timed', false, 'lb')).toBeNull()
})

const strongTargets = (benchId = 'bench'): Map<string, ImportTarget> =>
  new Map<string, ImportTarget>([
    ['Bench Press (Barbell)', { kind: 'mine', exerciseId: benchId, name: 'Bench press', loadType: 'weight', tracksDistance: false }],
    ['Pull Up (Assisted)', { kind: 'add', row: { name: 'Assisted Pull-Up', library_id: 'assisted-pull-up', load_type: 'assisted' } }],
    ['Chest Fly (Band)', { kind: 'add', row: { name: 'Chest Fly (Band)', load_type: 'bodyweight' } }],
    ['Running (Treadmill)', { kind: 'add', row: { name: 'Treadmill', load_type: 'timed', tracks_distance: true } }],
  ])

test('buildImportPlan makes a history-only partial backup, warm-ups left out unless kept', () => {
  const parsed = parseImport(strong, 'strong')!
  const plan = buildImportPlan({ parsed, targets: strongTargets(), includeWarmups: false, fallbackUnit: 'kg', existingKeys: new Set() })
  expect(plan.file).toMatchObject({ format: 'repbunny-backup', version: 2, includes: ['history'] })
  expect(plan.workouts).toBe(3)
  expect(plan.sets).toBe(7)
  expect(plan.skipped).toBe(0)
  // The user's own exercise is reused by name, never by a library link.
  expect(plan.file.exercises.find((e) => e.name === 'Bench press')).toMatchObject({ library_id: null, load_type: 'weight' })
  expect(plan.file.sets.every((s) => s.weight_unit === 'kg')).toBe(true)
  const first = plan.file.workouts[0]
  // Issue #535: an exercise's note goes on that exercise, not the workout note.
  expect(first.notes).toBe('From Strong: Push Day\nFelt strong')
  const benchId = plan.file.exercises.find((e) => e.name === 'Bench press')!.id
  expect(plan.file.workout_exercise_notes).toEqual([{ workout_id: first.id, exercise_id: benchId, note: 'Pause at the bottom' }])
  expect(plan.file.sets.filter((s) => s.workout_id === first.id).map((s) => s.set_index)).toEqual([0, 1, 2])

  const withWarmups = buildImportPlan({ parsed, targets: strongTargets(), includeWarmups: true, fallbackUnit: 'kg', existingKeys: new Set() })
  expect(withWarmups.sets).toBe(8)
})

test('a workout is skipped only when the same day already has exactly its sets', () => {
  const parsed = parseImport(strong, 'strong')!
  const last = parsed.workouts[2]
  const at = (h: number) => new Date(new Date(last.startedAt).setHours(h)).toISOString()
  // Mar 8: the same bench set at another time of day (an earlier import, or
  // typed in by hand) is a duplicate.
  const same = existingWorkoutKeys([{ id: 'w1', performed_at: at(6) }], [{ workout_id: 'w1', exercise_id: 'bench', reps: 8, weight: 140, weight_unit: 'lb' }])
  expect(buildImportPlan({ parsed, targets: strongTargets(), includeWarmups: false, fallbackUnit: 'lb', existingKeys: same }).skipped).toBe(1)

  // A backfilled workout that day with different sets isn't, and neither is
  // the same set on another day or on another exercise.
  for (const sets of [
    [{ workout_id: 'w1', exercise_id: 'bench', reps: 8, weight: 135, weight_unit: 'lb' }],
    [{ workout_id: 'w1', exercise_id: 'other', reps: 8, weight: 140, weight_unit: 'lb' }],
  ]) {
    const keys = existingWorkoutKeys([{ id: 'w1', performed_at: at(6) }], sets)
    expect(buildImportPlan({ parsed, targets: strongTargets(), includeWarmups: false, fallbackUnit: 'lb', existingKeys: keys }).skipped).toBe(0)
  }
  const otherDay = existingWorkoutKeys(
    [{ id: 'w1', performed_at: new Date(new Date(last.startedAt).getTime() + 86400000).toISOString() }],
    [{ workout_id: 'w1', exercise_id: 'bench', reps: 8, weight: 140, weight_unit: 'lb' }],
  )
  expect(buildImportPlan({ parsed, targets: strongTargets(), includeWarmups: false, fallbackUnit: 'lb', existingKeys: otherDay }).skipped).toBe(0)
})

test('rows a parser leaves out are counted, but Strong rest-timer and note rows are not (#484)', () => {
  const head = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'
  const text = [
    head,
    '2024-03-04 18:05:32,"Push",1h,"Bench",1,135,8,0,0,"","",',
    '2024-03-04 18:05:32,"Push",1h,"Bench",Rest Timer,0,0,0,90,"","",',
    '2024-03-04 18:05:32,"Push",1h,"Bench",Note,0,0,0,0,"x","",',
    'not a date,"Push",1h,"Bench",2,135,8,0,0,"","",',
    '2024-03-04 18:05:32,"Push",1h,"",3,135,8,0,0,"","",',
    '2024-03-04 18:05:32,"Push",1h,"Bench",oops,135,8,0,0,"","",',
  ].join('\n')
  expect(parseImport(text, 'strong')?.unreadable).toBe(3)
  expect(parseImport(strong, 'strong')?.unreadable).toBe(0)
  expect(parseImport(hevy, 'hevy')?.unreadable).toBe(0)
  const bad = hevy.split('\n').concat('"T","garbage","","","Curl",,"",0,"normal",30,10,,,').join('\n')
  expect(parseImport(bad, 'hevy')?.unreadable).toBe(1)
})

test('a Hevy export puts exercise_notes on the exercise, and a note on a skipped exercise stays in the workout note', () => {
  const parsed = parseImport(hevy, 'hevy')!
  const targets = new Map<string, ImportTarget>([
    ['Squat (Barbell)', { kind: 'add', row: { name: 'Back Squat', load_type: 'weight' } }],
    ['Plank', { kind: 'add', row: { name: 'Plank', load_type: 'timed' } }],
  ])
  const plan = buildImportPlan({ parsed, targets, includeWarmups: false, fallbackUnit: 'kg', existingKeys: new Set() })
  const first = plan.file.workouts[0]
  const squatId = plan.file.exercises.find((e) => e.name === 'Back Squat')!.id
  // "Belt on" is on two sets; it's one note.
  expect(plan.file.workout_exercise_notes.filter((n) => n.workout_id === first.id)).toEqual([
    { workout_id: first.id, exercise_id: squatId, note: 'Belt on' },
  ])
  expect(first.notes).toBe('From Hevy: Leg Day\nGood session')

  const noSquat = buildImportPlan({ parsed, targets: new Map([...targets].filter(([name]) => name !== 'Squat (Barbell)')), includeWarmups: false, fallbackUnit: 'kg', existingKeys: new Set() })
  expect(noSquat.file.workout_exercise_notes).toEqual([])
  expect(noSquat.file.workouts[0].notes).toBe('From Hevy: Leg Day\nGood session\nSquat (Barbell): Belt on')
})
