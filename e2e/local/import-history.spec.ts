import { writeFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { openAccountSection } from '../fixtures/account'

// Issue #208: Account > Your data > Import from another app. A Strong export
// lands as past workouts on the device: every exercise name is confirmed
// first (Yes / Other…), the user's own Bench press is reused rather than
// duplicated, and importing the same file again adds nothing.

const STRONG = 'e2e/fixtures/imports/strong-sample.csv'

async function start(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const at = new Date(Date.now() - 2 * 86400000).toISOString()
    const { error } = await repos.backup.restore({
      format: 'repbunny-backup',
      version: 2,
      exported_at: new Date().toISOString(),
      exercises: [{ id: 'bench', name: 'Bench press', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
      workout_templates: [],
      workout_template_exercises: [],
      workouts: [{ id: 'w1', performed_at: at, template_id: null, notes: null }],
      sets: [{ id: 's1', workout_id: 'w1', exercise_id: 'bench', set_index: 0, reps: 5, weight: 185, weight_unit: 'lb' }],
      body_weight_entries: [],
    })
    if (error) throw new Error(error.message)
  })
  await page.reload()
}

async function openImport(page: Page, file?: string) {
  const data = await openAccountSection(page, 'Your data')
  await data.getByRole('button', { name: /^Import from another app/ }).click()
  const pick = page.getByRole('dialog', { name: 'Import from another app' })
  await expect(pick.getByRole('radio', { name: /Strong/ })).toHaveAttribute('aria-checked', 'true')
  if (file) await pick.getByLabel('Export file').setInputFiles(file)
  return pick
}

test('local mode: a Strong export imports after every exercise is confirmed, and again adds nothing', async ({ page }) => {
  await start(page)
  await openImport(page, STRONG)

  const review = page.getByRole('dialog', { name: 'Match your exercises' })
  await expect(review.getByText('0 of 4 answered')).toBeVisible()
  const importButton = review.getByRole('button', { name: 'Import 3 workouts' })
  await expect(importButton).toBeDisabled()

  // The user's own exercise is the guess, not the library's Barbell Bench Press.
  const bench = review.getByRole('listitem', { name: 'Bench Press (Barbell)' })
  await expect(bench.getByText('Bench press', { exact: true })).toBeVisible()
  await expect(bench.getByText('Yours')).toBeVisible()
  await bench.getByRole('button', { name: 'Yes, same one' }).click()
  await expect(bench.getByRole('status')).toContainText('Bench press')

  // Other… opens the ranked sheet; Add as new keeps the file's name.
  const fly = review.getByRole('listitem', { name: 'Chest Fly (Band)' })
  await fly.getByRole('button', { name: 'Other…' }).click()
  const sheet = page.getByRole('dialog', { name: 'Match Chest Fly (Band)' })
  await sheet.getByRole('button', { name: /^Add as new exercise/ }).click()
  await expect(sheet).toBeHidden()
  await expect(fly.getByRole('status')).toContainText('New exercise')

  for (const name of ['Pull Up (Assisted)', 'Running (Treadmill)']) {
    await review.getByRole('listitem', { name }).getByRole('button', { name: /^(Yes, same one|Add as new)$/ }).click()
  }
  await expect(review.getByText('4 of 4 answered')).toBeVisible()
  await importButton.click()

  const confirm = page.getByRole('dialog', { name: 'Import 3 workouts?' })
  await expect(confirm.getByText('strong-sample.csv')).toBeVisible()
  // Newer Strong exports have no units, so the user says which.
  await confirm.getByRole('radiogroup', { name: 'Weights in this file are in' }).getByRole('radio', { name: 'lb' }).click()
  await expect(confirm.getByText('1 in this file.', { exact: false })).toBeVisible()
  await expect(confirm.getByRole('switch', { name: 'Keep warm-up sets' })).toHaveAttribute('aria-checked', 'false')
  await confirm.getByRole('button', { name: 'Import 3 workouts' }).click()

  const done = page.getByRole('dialog', { name: 'Import finished' })
  await expect(done.getByText('Welcome over from Strong')).toBeVisible()
  await expect(done.getByText(/Added 3 workouts and 7 sets/)).toBeVisible()

  const data = await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const exercises = await repos.backup.listAll('exercises')
    const sets = await repos.backup.listAll('sets')
    const workouts = await repos.backup.listAll('workouts')
    const bench = exercises.filter((e) => /bench/i.test(String(e.name)))
    return {
      bench: bench.map((e) => e.name),
      benchSets: sets.filter((s) => s.exercise_id === bench[0]?.id).length,
      names: exercises.map((e) => String(e.name)).sort(),
      workouts: workouts.length,
      notes: workouts.map((w) => w.notes).filter(Boolean),
      exerciseNotes: (await repos.backup.listAll('workout_exercise_notes')).map((n) => [n.exercise_id === bench[0]?.id, n.note]),
      assisted: sets.filter((s) => exercises.find((e) => e.id === s.exercise_id)?.load_type === 'assisted').map((s) => s.weight),
    }
  })
  expect(data.bench).toEqual(['Bench press'])
  expect(data.benchSets).toBe(4)
  expect(data.names).toContain('Chest Fly (Band)')
  expect(data.workouts).toBe(4)
  // Issue #535: the bench note goes on Bench press for that workout.
  expect(data.notes).toContain('From Strong: Push Day\nFelt strong')
  expect(data.exerciseNotes).toEqual([[true, 'Pause at the bottom']])
  expect(data.assisted).toEqual([40, 40])

  // Again: the answers are remembered, and every workout is already here.
  await done.getByRole('button', { name: 'Done' }).click()
  await openImport(page, STRONG)
  const again = page.getByRole('dialog', { name: 'Already imported' })
  await expect(again.getByText('3 skipped')).toBeVisible()
  await expect(again.getByText('Everything in this file is already here. Nothing to add.')).toBeVisible()
  await expect(again.getByRole('button', { name: 'Import 0 workouts' })).toBeDisabled()
})

test('local mode: a Hevy file picked as Strong says so and offers Hevy', async ({ page }) => {
  await start(page)
  const pick = await openImport(page)
  await pick.getByLabel('Export file').setInputFiles('e2e/fixtures/imports/hevy-sample.csv')
  await expect(pick.getByRole('alert')).toHaveText("This doesn't look like a Strong export. It looks like Hevy's.")
  await pick.getByRole('button', { name: 'Import it as Hevy' }).click()
  await expect(page.getByRole('dialog', { name: 'Match your exercises' }).getByText('0 of 3 answered')).toBeVisible()
})

// Issue #484: rows the parser can't read are counted in the preview.
test('local mode: the preview says how many rows were left out', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('strong-broken.csv')
  const head = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'
  writeFileSync(
    file,
    [
      head,
      '2024-03-04 18:05:32,"Push",1h,"Bench Press (Barbell)",1,135,8,0,0,"","",',
      'not a date,"Push",1h,"Bench Press (Barbell)",2,135,8,0,0,"","",',
      '2024-03-04 18:05:32,"Push",1h,"Bench Press (Barbell)",oops,135,8,0,0,"","",',
    ].join('\n'),
  )
  await start(page)
  await openImport(page, file)
  const review = page.getByRole('dialog', { name: 'Match your exercises' })
  await review.getByRole('button', { name: /^(Yes, same one|Add as new)$/ }).click()
  await review.getByRole('button', { name: 'Import 1 workout' }).click()
  const confirm = page.getByRole('dialog', { name: 'Import 1 workout?' })
  await expect(confirm.getByText('2 rows left out')).toBeVisible()
})

// Issue #790: Escape (Android back) on the Match sheet closes only that sheet.
test('local mode: Escape on a Match sheet closes it and keeps the review step', async ({ page }) => {
  await start(page)
  await openImport(page, STRONG)

  const review = page.getByRole('dialog', { name: 'Match your exercises' })
  await review.getByRole('listitem', { name: 'Chest Fly (Band)' }).getByRole('button', { name: 'Other…' }).click()
  const sheet = page.getByRole('dialog', { name: 'Match Chest Fly (Band)' })
  await expect(sheet).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(review.getByText('0 of 4 answered')).toBeVisible()
})
