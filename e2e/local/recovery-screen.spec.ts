import { test, expect, localDb, startLocal } from '../fixtures/local'
import type { Page } from '@playwright/test'

// Issue #431 (design docs/design/issue-431-recovery-screen.html): when the
// on-device data can't open, local mode shows a recovery screen instead of
// Home. These damage the real stored database (jeep-sqlite keeps it in
// IndexedDB, under the plugin's "SQLite.db" suffix) and reload, like a phone
// relaunching onto a broken file.

const STORE = 'jeepSqliteStore'
const DAMAGED_BYTES = 8192

async function seedRoutine(page: Page, exerciseName: string, templateName: string) {
  const admin = localDb(page)
  const { data: exercise, error } = await admin.from('exercises').insert({ name: exerciseName }).select('id').single()
  if (error) throw error
  const { data: template, error: templateError } = await admin.from('workout_templates').insert({ name: templateName }).select('id').single()
  if (templateError) throw templateError
  const { error: linkError } = await admin
    .from('workout_template_exercises')
    .insert({ template_id: template!.id, exercise_id: exercise!.id, position: 0 })
  if (linkError) throw linkError
}

// Saves a restore point through the app's own code, as a finished workout does.
async function saveRestorePoint(page: Page, label: string) {
  await page.evaluate(async (l) => {
    const { saveRestorePoint } = await window.__rbImport('/src/lib/restorePoints.ts')
    await saveRestorePoint('workout', l)
  }, label)
}

async function buildBackupJson(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { buildBackup } = await window.__rbImport('/src/lib/backup.ts')
    return JSON.stringify(await buildBackup())
  })
}

// The stored databases: key and size.
async function storedDatabases(page: Page): Promise<Record<string, number>> {
  return page.evaluate(
    (store) =>
      new Promise<Record<string, number>>((resolve, reject) => {
        const open = indexedDB.open(store)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const out: Record<string, number> = {}
          const cursor = db.transaction('databases').objectStore('databases').openCursor()
          cursor.onerror = () => reject(cursor.error)
          cursor.onsuccess = () => {
            const c = cursor.result
            if (!c) {
              db.close()
              resolve(out)
              return
            }
            out[String(c.key)] = (c.value as Uint8Array).byteLength
            c.continue()
          }
        }
      }),
    STORE,
  )
}

// Overwrites the app's database with garbage, then relaunches.
async function damageAndReload(page: Page) {
  await page.evaluate(
    ([store, size]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(store as string)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('databases', 'readwrite')
          tx.objectStore('databases').put(new Uint8Array(size as number).fill(66), 'repbunnySQLite.db')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    [STORE, DAMAGED_BYTES] as const,
  )
  await page.reload()
}

const DAMAGED_HEADING = 'Something went wrong opening your workouts'

test('damaged data offers the newest restore point and keeps the damaged copy', async ({ page, stamp }) => {
  const exerciseName = `E2E Recover Press ${stamp}`
  const templateName = `E2E Recover Day ${stamp}`
  await startLocal(page, { beforeNavigate: () => seedRoutine(page, exerciseName, templateName) })
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
  await saveRestorePoint(page, 'Before an older day')
  await saveRestorePoint(page, `After ${templateName}`)

  await damageAndReload(page)

  await expect(page.getByRole('heading', { name: DAMAGED_HEADING })).toBeVisible()
  await expect(page.getByTestId('newest-restore-point')).toContainText(`after ${templateName}, is saved on this phone`)
  await expect(page.getByTestId('newest-restore-point')).toContainText('0 workouts')
  await expect(page.getByRole('button', { name: 'Send a bug report' })).toBeVisible()

  // The full list is there too.
  await page.getByRole('button', { name: 'See all restore points' }).click()
  const list = page.getByRole('dialog', { name: 'Restore points' })
  await expect(list.getByText("Pick the one to bring back. Anything logged after it isn't in it.")).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await list.getByRole('button', { name: 'Close' }).click()
  await expect(list).toHaveCount(0)

  await page.getByRole('button', { name: 'Restore it' }).click()
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: DAMAGED_HEADING })).toHaveCount(0)

  // The damaged database is still stored, untouched, beside the new one.
  const stored = await storedDatabases(page)
  expect(stored['repbunnySQLite.db']).toBe(DAMAGED_BYTES)
  expect(Object.keys(stored).filter((key) => /^repbunny-\d{14}SQLite\.db$/.test(key))).toHaveLength(1)

  // And the app keeps using the new one after another launch.
  await page.reload()
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
})

test('damaged data with no restore point restores from a backup file', async ({ page, stamp }) => {
  const exerciseName = `E2E File Press ${stamp}`
  const templateName = `E2E File Day ${stamp}`
  await startLocal(page, { beforeNavigate: () => seedRoutine(page, exerciseName, templateName) })
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
  const backup = await buildBackupJson(page)

  await damageAndReload(page)

  await expect(page.getByRole('heading', { name: DAMAGED_HEADING })).toBeVisible()
  await expect(page.getByText("There's no restore point saved on this phone yet.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore it' })).toHaveCount(0)

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Restore from a file' }).click()
  await (await chooser).setFiles({ name: 'repbunny-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) })

  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
  expect((await storedDatabases(page))['repbunnySQLite.db']).toBe(DAMAGED_BYTES)
})

test('a failed update says the data is safe and saves a backup file', async ({ page, stamp }) => {
  const exerciseName = `E2E Update Press ${stamp}`
  const templateName = `E2E Update Day ${stamp}`
  await startLocal(page, { beforeNavigate: () => seedRoutine(page, exerciseName, templateName) })
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()

  // Dev-only hook (src/data/sqlite/capacitor.ts): the next open fails like an
  // update whose checks failed (MigrationCheckError).
  await page.evaluate(() => localStorage.setItem('rb-dev-fail-next-update', '1'))
  await page.reload()

  await expect(page.getByRole('heading', { name: "This update couldn't finish" })).toBeVisible()
  await expect(page.getByText('Your workouts are safe and unchanged.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore it' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Restore from a file' })).toHaveCount(0)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save a backup file' }).click()
  const file = await (await download).path()
  const backup = JSON.parse(await (await import('node:fs/promises')).readFile(file, 'utf8'))
  expect(backup.format).toBe('repbunny-backup')
  expect(backup.exercises.map((e: { name: string }) => e.name)).toContain(exerciseName)
  expect(backup.workout_templates.map((t: { name: string }) => t.name)).toContain(templateName)

  // The bug report opens over the screen and lists what went wrong.
  await page.getByRole('button', { name: 'Send a bug report' }).click()
  const report = page.getByRole('dialog', { name: 'Report a bug' })
  await expect(report).toContainText("Couldn't open the on-device data")
  await report.getByRole('button', { name: 'Close' }).click()

  // The data was never touched: the next launch (the hook is used up) opens it.
  await page.reload()
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
})

// Issue #452: a failed restore goes back to the damaged data, and the recovery
// screen keeps failing fast instead of reading the deleted new database.
test('a failed restore leaves the recovery screen working and a second restore succeeds', async ({ page, stamp }) => {
  const exerciseName = `E2E Retry Press ${stamp}`
  const templateName = `E2E Retry Day ${stamp}`
  await startLocal(page, { beforeNavigate: () => seedRoutine(page, exerciseName, templateName) })
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
  const backup = JSON.parse(await buildBackupJson(page))
  const broken = { ...backup, exercises: [{ ...backup.exercises[0], name: null }] }

  await damageAndReload(page)
  await expect(page.getByRole('heading', { name: DAMAGED_HEADING })).toBeVisible()

  // The error log can't load on the damaged data; note exactly how it fails.
  const loadFailure = async () => {
    await page.getByRole('button', { name: 'Send a bug report' }).click()
    const dialog = page.getByRole('dialog')
    const line = dialog.getByText("Couldn't load the stored errors")
    await expect(line).toBeVisible()
    const text = await line.innerText()
    await dialog.getByRole('button', { name: 'Close' }).click()
    return text
  }
  const failureBefore = await loadFailure()

  const pick = async (contents: unknown) => {
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Restore from a file' }).click()
    await (await chooser).setFiles({ name: 'repbunny-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(contents)) })
  }
  await pick(broken)
  await expect(page.getByText(/Couldn't restore it\..*Nothing was changed\./)).toBeVisible()
  expect((await storedDatabases(page))['repbunnySQLite.db']).toBe(DAMAGED_BYTES)

  // Same failure as before the attempt, not the deleted new database's connection.
  expect(await loadFailure()).toBe(failureBefore)

  await pick(backup)
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
})

// Issue #641: with no backup to restore, "Start fresh" sets the damaged data
// aside (kept) and opens the app empty, on onboarding.
test('damaged data can start fresh after a confirmation and keeps the damaged copy', async ({ page, stamp }) => {
  const templateName = `E2E Fresh Day ${stamp}`
  await startLocal(page, { beforeNavigate: () => seedRoutine(page, `E2E Fresh Press ${stamp}`, templateName) })
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()

  await damageAndReload(page)
  await expect(page.getByRole('heading', { name: DAMAGED_HEADING })).toBeVisible()

  // A second step first; cancelling changes nothing.
  await page.getByRole('button', { name: 'Start fresh' }).click()
  await expect(page.getByText('Your current data stays set aside on this phone.')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: DAMAGED_HEADING })).toBeVisible()
  expect(Object.keys(await storedDatabases(page)).filter((key) => /^repbunny-\d{14}SQLite\.db$/.test(key))).toHaveLength(0)

  await page.getByRole('button', { name: 'Start fresh' }).click()
  await page.getByRole('button', { name: 'Start fresh' }).click()

  await expect(page.getByRole('heading', { name: DAMAGED_HEADING })).toHaveCount(0)
  await expect(page.getByRole('button', { name: templateName, exact: true })).toHaveCount(0)
  // An empty database opens the app (onboarding for a new install; this suite presets the wizard as done).
  await expect(page.getByRole('navigation').first()).toBeVisible()

  const stored = await storedDatabases(page)
  expect(stored['repbunnySQLite.db']).toBe(DAMAGED_BYTES)
  expect(Object.keys(stored).filter((key) => /^repbunny-\d{14}SQLite\.db$/.test(key))).toHaveLength(1)
})

test('a failed update does not offer Start fresh', async ({ page }) => {
  await startLocal(page)
  // Issue #753: the hook is consumed by whichever open reads it first, so set
  // it from an init script (before any app code on the next load) rather than
  // from the page, where a straggling open from the current load could eat it.
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await page.addInitScript(() => localStorage.setItem('rb-dev-fail-next-update', '1'))
  await page.reload()
  await expect(page.getByRole('heading', { name: "This update couldn't finish" })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start fresh' })).toHaveCount(0)
})
