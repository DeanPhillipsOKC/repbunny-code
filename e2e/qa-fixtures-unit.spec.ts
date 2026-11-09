import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { openSqlJsDb } from './fixtures/sqljs'
import { createSqliteRepos } from '../src/data/sqlite/repos'
import type { BackupFile } from '../src/lib/backup'
import { detectApp, parseImport, sourceExercises } from '../src/lib/importHistory'
import { parseTrialState } from '../src/lib/trialPass'
import { AREAS, TEST_CASES, JOURNEYS, RELEASE_CHECKS } from '../scripts/qa/procedure.mjs'
import { SCENARIOS, RAW_FILES, buildFixtureFiles } from '../scripts/qa/fixtures.mjs'

// Issue #211: the QA procedure's data (scripts/qa/procedure.mjs) and every
// test case's generated file (scripts/qa/fixtures.mjs). Each backup is
// restored through the SQLite repos, the same code the store build runs, so
// a file that wouldn't load on the phone fails here first.

type Area = { id: string; name: string; paths: string[] }
type TestCase = { id: string; area: string; title: string; tier: string; smoke?: boolean; steps: string[]; expected: string; data?: { scenario: string; label: string } }
type Fixture = { folder: string; name: string; contents: string; testCase: TestCase; scenario: string }

const areas = AREAS as Area[]
const testCases = TEST_CASES as TestCase[]
const NOW = new Date('2026-10-09T15:00:00')

// src/lib/backup.ts's parseBackup, which can't load in Node (it imports the
// data layer, which reads Vite's env).
function parseBackup(text: string): BackupFile | null {
  try {
    const data = JSON.parse(text)
    return data && data.format === 'repbunny-backup' ? (data as BackupFile) : null
  } catch {
    return null
  }
}

async function freshRepos() {
  const db = await openSqlJsDb()
  return createSqliteRepos(async () => db, { now: () => NOW })
}

test('every test case is well formed and every area has one', () => {
  const areaIds = new Set(areas.map((a) => a.id))
  const ids = new Set<string>()
  for (const tc of testCases) {
    expect(tc.id, tc.id).toMatch(new RegExp(`^TC-${tc.area}-\\d{3}$`))
    expect(areaIds.has(tc.area), tc.id).toBe(true)
    expect(ids.has(tc.id), `${tc.id} is duplicated`).toBe(false)
    ids.add(tc.id)
    expect(['free', 'premium', 'both'], tc.id).toContain(tc.tier)
    expect(tc.steps.length, tc.id).toBeGreaterThan(0)
    expect(tc.expected.length, tc.id).toBeGreaterThan(0)
  }
  for (const area of areas) expect(testCases.some((tc) => tc.area === area.id), area.id).toBe(true)
  const smoke = testCases.filter((tc) => tc.smoke).length
  expect(smoke).toBeGreaterThanOrEqual(15)
  expect(smoke).toBeLessThanOrEqual(30)
  for (const journey of JOURNEYS as { id: string; areas: string[]; data?: string }[]) {
    for (const a of journey.areas) expect(areaIds.has(a), journey.id).toBe(true)
    if (journey.data) expect(SCENARIOS[journey.data], journey.id).toBeTruthy()
  }
  expect((RELEASE_CHECKS as unknown[]).length).toBeGreaterThan(0)
})

// A renamed or deleted file would quietly stop "Changed since last pass"
// from ever firing for its area.
test('every area path exists in the repo', () => {
  for (const area of areas) {
    for (const path of area.paths) expect(existsSync(path), `${area.id}: ${path}`).toBe(true)
  }
})

test('file and folder names are safe for Google Drive and Windows', () => {
  const files = buildFixtureFiles(testCases, areas, NOW) as Fixture[]
  expect(files.length).toBe(testCases.filter((tc) => tc.data).length)
  for (const f of files) {
    expect(f.name, f.name).toMatch(/^TC-[A-Z]+-\d{3} [a-z0-9 ]+\.(json|csv)$/)
    expect(f.folder, f.folder).not.toMatch(/[\\/:*?"<>|]/)
  }
})

test('every backup scenario restores cleanly through the SQLite repos', async () => {
  test.setTimeout(240_000)
  for (const [key, scenario] of Object.entries(SCENARIOS as Record<string, { build: (now: Date) => BackupFile }>)) {
    const file = parseBackup(JSON.stringify(scenario.build(NOW)))
    expect(file, key).not.toBeNull()
    // A library id that didn't resolve would become an exercise named like one.
    for (const e of file!.exercises) expect(String(e.name), `${key}: ${e.name}`).not.toMatch(/^[a-z_]+$/)

    const repos = await freshRepos()
    const { error } = await repos.backup.restore(file!)
    expect(error, key).toBeNull()
    const counts = await repos.backup.countWorkoutsAndSets()
    expect(counts, key).toEqual({ workouts: file!.workouts.length, sets: file!.sets.length })
    const exercises = await repos.backup.listAll('exercises')
    expect(exercises.length, key).toBe(file!.exercises.length)
    if (file!.trial_passes) expect(parseTrialState(file!.trial_passes), key).toEqual(file!.trial_passes)
  }
})

test('broken and foreign backups are refused, import files parse as intended', async () => {
  for (const [key, raw] of Object.entries(RAW_FILES as Record<string, { kind: string; build: (now: Date) => string }>)) {
    const text = raw.build(NOW)
    switch (raw.kind) {
      case 'rejected-backup': {
        expect(parseBackup(text), key).toBeNull()
        // And the restore itself refuses it, leaving the data alone.
        let parsed: unknown = null
        try {
          parsed = JSON.parse(text)
        } catch {
          break
        }
        const repos = await freshRepos()
        const { error } = await repos.backup.restore(parsed as BackupFile)
        expect(error, key).not.toBeNull()
        break
      }
      case 'import-strong':
      case 'import-hevy': {
        const app = raw.kind === 'import-strong' ? 'strong' : 'hevy'
        expect(detectApp(text), key).toBe(app)
        const parsed = parseImport(text, app)
        expect(parsed, key).not.toBeNull()
        expect(parsed!.workouts.length, key).toBeGreaterThan(4)
        expect(sourceExercises(parsed!).length, key).toBeGreaterThan(2)
        break
      }
      case 'import-unknown':
        expect(detectApp(text), key).toBeNull()
        expect(parseImport(text, 'strong'), key).toBeNull()
        break
      case 'import-strong-broken':
        expect(detectApp(text), key).toBe('strong')
        expect(() => parseImport(text, 'strong'), key).not.toThrow()
        break
      default:
        throw new Error(`${key}: unknown kind ${raw.kind}`)
    }
  }
})

// The relative dates are the point: these scenarios only test what they
// claim if their dates land where the app looks.
test('date-sensitive scenarios land where the app looks', () => {
  const build = (key: string) => (SCENARIOS as Record<string, { build: (now: Date) => BackupFile }>)[key].build(NOW)
  const dates = (f: BackupFile) => f.workouts.map((w) => new Date(String(w.performed_at)))

  const lastMonth = dates(build('lastMonth'))
  expect(lastMonth.some((d) => d.getMonth() === NOW.getMonth() - 1)).toBe(true)
  expect(lastMonth.every((d) => d < new Date(NOW.getFullYear(), NOW.getMonth(), 1))).toBe(true)

  const empty = dates(build('emptyLastMonth'))
  expect(empty.some((d) => d.getMonth() === NOW.getMonth() - 1)).toBe(false)

  const returning = dates(build('returning'))
  expect(Math.max(...returning.map((d) => d.getTime()))).toBeLessThan(NOW.getTime() - 30 * 86_400_000)

  const ending = build('trialEnding').trial_passes!.trials[0]
  const endsAt = new Date(ending.startedAt).getTime() + 7 * 86_400_000
  expect(endsAt).toBeGreaterThan(NOW.getTime())
  expect(endsAt - NOW.getTime()).toBeLessThan(86_400_000)

  const near = build('milestoneNear')
  expect(near.workouts.length).toBe(9)

  const plateau = build('plateau')
  const bench = plateau.exercises.find((e) => e.library_id === 'barbell_bench_press')!
  const benchWorkouts = new Set(plateau.sets.filter((s) => s.exercise_id === bench.id).map((s) => s.workout_id))
  expect(benchWorkouts.size).toBe(11)

  const five = build('fiveYears')
  expect(five.sets.length).toBeGreaterThan(15_000)
})
