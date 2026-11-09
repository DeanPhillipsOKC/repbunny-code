import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { openAccountSection } from '../fixtures/account'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Issue #432: an automatic copy saves after every workout, plus a dated one a
// week (newest 4 kept). Issue #874: it's on by default, in a folder the app
// picks (iCloud Drive › RepBunny on iPhone), with no ask on the recap; a
// folder the person picks takes priority, turning it off needs a warning, and
// Your data › Your copies lists the copies to restore one. It runs against
// the BackupFolder plugin's browser stand-in (src/lib/backupFolderWeb.ts),
// whose folders are localStorage entries: FILES for a picked folder,
// DEFAULT_FILES for the app's own.

const FILES = 'backup-folder-web-files'
const DEFAULT_FILES = 'backup-folder-web-default-files'

type Files = Record<string, { text: string; modified: number }>

async function folderFiles(page: Page, key = FILES): Promise<Files> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), key)
}

async function workoutsIn(page: Page, name: string, key = FILES) {
  const files = await folderFiles(page, key)
  return files[name] ? (JSON.parse(files[name].text).workouts as unknown[]).length : null
}

async function start(page: Page, stamp: number, options: { pick?: string; defaultFolder?: string } = {}) {
  const exerciseName = `E2E Copy Press ${stamp}`
  const templateName = `E2E Copy Day ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async () => {
      if (options.pick) await page.evaluate((pick) => localStorage.setItem('backup-folder-web-pick', pick), options.pick)
      if (options.defaultFolder) {
        await page.evaluate((info) => localStorage.setItem('backup-folder-web-default', info), options.defaultFolder)
      }
      const { data: exercise, error } = await admin.from('exercises').insert({ name: exerciseName }).select('id').single()
      if (error) throw error
      const { data: template, error: templateError } = await admin.from('workout_templates').insert({ name: templateName }).select('id').single()
      if (templateError) throw templateError
      const { error: linkError } = await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: exercise!.id, position: 0 })
      if (linkError) throw linkError
    },
  })
  return { exerciseName, templateName }
}

async function finishWorkout(page: Page, names: { exerciseName: string; templateName: string }) {
  await page.getByRole('button', { name: names.templateName, exact: true }).click()
  await selectExercise(page, names.exerciseName, true)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
}

async function closeRecap(page: Page) {
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('post-finish-card')).toHaveCount(0)
}

async function openSheet(page: Page) {
  const data = await openAccountSection(page, 'Your data')
  await data.getByRole('button', { name: /^Automatic copy/ }).click()
  return page.getByRole('dialog', { name: 'Automatic copy' })
}

async function chooseFolderInSheet(page: Page) {
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: 'Change folder' }).click()
  return sheet
}

test('the copy is on by default in RepBunny\'s folder, with no ask on the recap', async ({ page, stamp }) => {
  const names = await start(page, stamp)
  await finishWorkout(page, names)
  await expect(page.getByTestId('auto-copy-offer')).toHaveCount(0)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(1)
  const dated = Object.keys(await folderFiles(page, DEFAULT_FILES)).filter((name) => /^RepBunny backup \d{4}-\d{2}-\d{2}\.json$/.test(name))
  expect(dated).toHaveLength(1)
  await closeRecap(page)

  await finishWorkout(page, names)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(2)
  // Still one dated copy: those are weekly.
  expect(Object.keys(await folderFiles(page, DEFAULT_FILES))).toHaveLength(2)
  expect(await folderFiles(page)).toEqual({})
  await closeRecap(page)

  const data = await openAccountSection(page, 'Your data')
  await expect(data.getByTestId('auto-copy-row-caption')).toHaveText('Saving to iCloud Drive › RepBunny after every workout')
  await data.getByRole('button', { name: /^Automatic copy/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Automatic copy' })
  await expect(sheet.getByTestId('auto-copy-status')).toContainText(/Saving to iCloud Drive › RepBunny, last saved today at/)
  await expect(sheet.getByTestId('auto-copy-status')).toContainText('Safe even if you lose this phone.')
  await expect(sheet.getByRole('button', { name: "Use RepBunny's folder" })).toHaveCount(0)

  // The file is an ordinary backup.
  const text = (await folderFiles(page, DEFAULT_FILES))['RepBunny backup.json'].text
  const parsed = await page.evaluate(async (fileText) => {
    const { parseBackup } = await window.__rbImport('/src/lib/backup.ts')
    return parseBackup(fileText) !== null
  }, text)
  expect(parsed).toBe(true)
})

test('turning the copy off needs the warning, and Turn it on brings it back', async ({ page, stamp }) => {
  const names = await start(page, stamp)
  await finishWorkout(page, names)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(1)
  await closeRecap(page)

  let sheet = await openSheet(page)
  await sheet.getByRole('button', { name: 'Turn it off' }).click()
  const confirm = page.getByRole('dialog', { name: 'Turn off the copy?' })
  await expect(confirm).toContainText("If it's lost, reset, or the app is deleted, your workouts are gone for good, and we can't get them back.")
  // Keep a copy is the default, and keeps it on.
  await expect(confirm.getByRole('button', { name: 'Keep a copy' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Keep a copy' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(sheet.getByTestId('auto-copy-status')).toContainText('Saving to iCloud Drive › RepBunny')

  await sheet.getByRole('button', { name: 'Turn it off' }).click()
  await confirm.getByRole('button', { name: 'Turn it off' }).click()
  await expect(sheet.getByTestId('auto-copy-status')).toContainText('Off')
  await expect(sheet.getByTestId('auto-copy-status')).toContainText('Everything is stored only on this phone.')
  await sheet.getByRole('button', { name: 'Close' }).click()

  // Off stays off, through a relaunch and more workouts.
  await page.reload()
  await finishWorkout(page, names)
  await closeRecap(page)
  expect(await workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(1)
  const data = await openAccountSection(page, 'Your data')
  await expect(data.getByTestId('auto-copy-row-caption')).toHaveText('Off')

  await data.getByRole('button', { name: /^Automatic copy/ }).click()
  sheet = page.getByRole('dialog', { name: 'Automatic copy' })
  await sheet.getByRole('button', { name: 'Turn it on' }).click()
  await expect(sheet.getByTestId('auto-copy-status')).toContainText(/Saving to iCloud Drive › RepBunny, last saved today at/)
  expect(await workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(2)
})

test('a picked folder takes priority, and Use RepBunny\'s folder goes back', async ({ page, stamp }) => {
  const names = await start(page, stamp)
  await finishWorkout(page, names)
  await closeRecap(page)

  const sheet = await chooseFolderInSheet(page)
  await expect(sheet.getByTestId('auto-copy-status')).toContainText(/Saving to RepBunny, last saved today at/)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json')).toBe(1)
  await sheet.getByRole('button', { name: 'Close' }).click()

  await finishWorkout(page, names)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json')).toBe(2)
  // The default folder keeps the copy from before, untouched.
  expect(await workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(1)
  await closeRecap(page)

  const again = await openSheet(page)
  await again.getByRole('button', { name: "Use RepBunny's folder" }).click()
  await expect(again.getByTestId('auto-copy-status')).toContainText('Saving to iCloud Drive › RepBunny')
  await expect(again.getByRole('button', { name: "Use RepBunny's folder" })).toHaveCount(0)
  // Back in a folder that already held a copy: that one is kept (#871).
  await expect(again.getByTestId('auto-copy-kept')).toContainText(/kept as RepBunny backup kept \d{4}-\d{2}-\d{2}\./)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(2)
})

test('a folder only on the phone says it does not survive losing the phone', async ({ page, stamp }) => {
  const names = await start(page, stamp, { defaultFolder: JSON.stringify({ name: 'Documents › RepBunny', local: true }) })
  await finishWorkout(page, names)
  await closeRecap(page)
  const sheet = await openSheet(page)
  await expect(sheet.getByTestId('auto-copy-status')).toContainText('Saving to Documents › RepBunny')
  await expect(sheet.getByTestId('auto-copy-status')).toContainText('It protects you from app problems, but not from losing your phone.')
})

test('closing the picker keeps the folder it had', async ({ page, stamp }) => {
  const names = await start(page, stamp, { pick: 'cancel' })
  await finishWorkout(page, names)
  await closeRecap(page)
  const sheet = await chooseFolderInSheet(page)
  await expect(sheet.getByRole('button', { name: 'Change folder' })).toBeEnabled()
  await expect(sheet.getByRole('alert')).toHaveCount(0)
  await expect(sheet.getByTestId('auto-copy-status')).toContainText('Saving to iCloud Drive › RepBunny')
  expect(await folderFiles(page)).toEqual({})
})

test('an unreachable folder shows in Your data and once on the next recap', async ({ page, stamp }) => {
  const names = await start(page, stamp)
  await finishWorkout(page, names)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(1)
  await closeRecap(page)

  await page.evaluate(() => localStorage.setItem('backup-folder-web-unreachable', '1'))
  await finishWorkout(page, names)
  await closeRecap(page)
  const data = await openAccountSection(page, 'Your data')
  await expect(data.getByTestId('auto-copy-row-caption')).toHaveText("Can't reach iCloud Drive › RepBunny")
  await data.getByRole('button', { name: 'Close' }).first().click()

  await finishWorkout(page, names)
  await expect(page.getByTestId('auto-copy-note')).toContainText("RepBunny couldn't reach iCloud Drive › RepBunny.")
  await closeRecap(page)
  await finishWorkout(page, names)
  await expect(page.getByTestId('auto-copy-note')).toHaveCount(0)
  await closeRecap(page)

  // Reachable again: the next save clears it.
  await page.evaluate(() => localStorage.removeItem('backup-folder-web-unreachable'))
  await finishWorkout(page, names)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(5)
  await closeRecap(page)
  const after = await openAccountSection(page, 'Your data')
  await expect(after.getByTestId('auto-copy-row-caption')).toHaveText('Saving to iCloud Drive › RepBunny after every workout')
})

test('weekly dated copies keep the newest 4, and an empty save never replaces a copy', async ({ page, stamp }) => {
  const names = await start(page, stamp)
  await finishWorkout(page, names)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(1)
  await closeRecap(page)

  await page.evaluate(async () => {
    const { saveAutoCopy } = await window.__rbImport('/src/lib/backupFolder.ts')
    const start = Date.now()
    for (let week = 1; week <= 6; week++) await saveAutoCopy(new Date(start + week * 7 * 24 * 60 * 60 * 1000 + 60_000))
  })
  const dated = Object.keys(await folderFiles(page, DEFAULT_FILES))
    .filter((name) => name !== 'RepBunny backup.json')
    .sort()
  expect(dated).toHaveLength(4)

  // Reset my data, then a save: the copy with the workout stays.
  await (await openAccountSection(page, 'Reset & erase')).getByRole('button', { name: 'Reset my data' }).click()
  const reset = page.getByRole('dialog', { name: 'Reset your data?' })
  await reset.getByLabel('Type RESET to confirm').fill('RESET')
  await reset.getByRole('button', { name: 'Reset my data' }).click()
  await expect(reset).toHaveCount(0)
  await page.evaluate(async () => {
    const { saveAutoCopy } = await window.__rbImport('/src/lib/backupFolder.ts')
    await saveAutoCopy()
  })
  expect(await workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(1)
})

test('picking a folder that already holds a copy keeps that copy instead of overwriting it', async ({ page, stamp }) => {
  // Issue #871: the lost-phone case. A new phone with one workout picks the
  // folder that holds the old phone's full history.
  const old = JSON.stringify({ app: 'repbunny', workouts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })
  const names = await start(page, stamp)
  await page.evaluate(
    ([key, text]) => localStorage.setItem(key, JSON.stringify({ 'RepBunny backup.json': { text, modified: 1 } })),
    [FILES, old],
  )
  await finishWorkout(page, names)
  await closeRecap(page)
  const sheet = await chooseFolderInSheet(page)
  await expect(sheet.getByTestId('auto-copy-kept')).toContainText(/The copy already in this folder was kept as RepBunny backup kept \d{4}-\d{2}-\d{2}\./)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json')).toBe(1)
  const kept = Object.keys(await folderFiles(page)).filter((name) => /^RepBunny backup kept \d{4}-\d{2}-\d{2}\.json$/.test(name))
  expect(kept).toHaveLength(1)
  expect((await folderFiles(page))[kept[0]].text).toBe(old)

  // Picking the same folder again keeps this phone's copy under a new name,
  // never over the first kept one; the weekly prune leaves both alone.
  await sheet.getByRole('button', { name: 'Change folder' }).click()
  await expect(sheet.getByTestId('auto-copy-kept')).toContainText(/kept as RepBunny backup kept \d{4}-\d{2}-\d{2} 2\./)
  await page.evaluate(async () => {
    const { saveAutoCopy } = await window.__rbImport('/src/lib/backupFolder.ts')
    const start = Date.now()
    for (let week = 1; week <= 6; week++) await saveAutoCopy(new Date(start + week * 7 * 24 * 60 * 60 * 1000 + 60_000))
  })
  const files = await folderFiles(page)
  expect(files[kept[0]].text).toBe(old)
  expect(Object.keys(files).filter((name) => name.includes(' kept '))).toHaveLength(2)
})

test('the default folder already holding a copy keeps it on the first save', async ({ page, stamp }) => {
  // Issue #874: a reinstall that starts fresh, with the old copy still in
  // iCloud Drive › RepBunny.
  const old = JSON.stringify({ app: 'repbunny', workouts: [{ id: 'a' }, { id: 'b' }] })
  const names = await start(page, stamp)
  await page.evaluate(
    ([key, text]) => localStorage.setItem(key, JSON.stringify({ 'RepBunny backup.json': { text, modified: 1 } })),
    [DEFAULT_FILES, old],
  )
  await finishWorkout(page, names)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(1)
  const files = await folderFiles(page, DEFAULT_FILES)
  const kept = Object.keys(files).filter((name) => /^RepBunny backup kept \d{4}-\d{2}-\d{2}\.json$/.test(name))
  expect(kept).toHaveLength(1)
  expect(files[kept[0]].text).toBe(old)
})

test('Your copies lists the copies with their workouts and opens one in the restore preview', async ({ page, stamp }) => {
  const names = await start(page, stamp)
  await finishWorkout(page, names)
  await closeRecap(page)
  await finishWorkout(page, names)
  await expect.poll(() => workoutsIn(page, 'RepBunny backup.json', DEFAULT_FILES)).toBe(2)
  await closeRecap(page)

  const data = await openAccountSection(page, 'Your data')
  await data.getByRole('button', { name: /^Your copies/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Your copies' })
  await expect(sheet.getByTestId('your-copies-lede')).toContainText('Saved to iCloud Drive › RepBunny after every workout')
  const list = sheet.getByRole('list', { name: 'Saved copies' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list.getByRole('button').nth(0)).toContainText('Latest copy')
  await expect(list.getByRole('button').nth(0)).toContainText('2 workouts')
  await expect(list.getByRole('button').nth(1)).toContainText('Weekly copy')
  await expect(list.getByRole('button').nth(1)).toContainText('1 workout')

  await list.getByRole('button').nth(1).click()
  const preview = page.getByRole('dialog', { name: 'Restore this backup?' })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('Weekly copy')
})
