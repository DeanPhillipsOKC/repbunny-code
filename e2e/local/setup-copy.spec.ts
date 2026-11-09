import { test, expect, type Page } from '@playwright/test'
import { localDb, startLocal } from '../fixtures/local'
import { openAccountSection } from '../fixtures/account'

// Issue #874 (design docs/design/issue-874-automatic-copy.html): the setup
// wizard's automatic copy step, which is information and not a choice, and
// the welcome screen's restore from the copies an old install left behind.
// Runs in local mode against the BackupFolder plugin's browser stand-in
// (src/lib/backupFolderWeb.ts). Like setup-wizard.spec.ts, it clears the
// "setup done" flag playwright.config.ts presets.
test.use({ viewport: { width: 375, height: 800 }, storageState: { cookies: [], origins: [] } })

const FILES = 'backup-folder-web-files'
const DEFAULT_FILES = 'backup-folder-web-default-files'

function wizard(page: Page) {
  return page.getByRole('dialog', { name: 'Set up RepBunny' })
}

async function openCopyStep(page: Page) {
  const w = wizard(page)
  await w.getByRole('button', { name: 'Set up in 30 seconds' }).click()
  await w.getByRole('button', { name: 'Next' }).click()
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'Your workouts, kept safe' })).toBeVisible()
  await expect(w.getByText('Step 3 of 4')).toBeVisible()
  return w
}

// A backup made on another "phone" with a routine on it, as its automatic
// copy would hold it.
async function backupFrom(page: Page, templateName: string) {
  const other = await page.context().browser()!.newContext({ baseURL: test.info().project.use.baseURL })
  const otherPage = await other.newPage()
  await startLocal(otherPage, {
    beforeNavigate: async () => {
      const { error } = await localDb(otherPage).from('workout_templates').insert({ name: templateName })
      if (error) throw error
    },
  })
  const backup = await otherPage.evaluate(async () => {
    const { buildBackup } = await window.__rbImport('/src/lib/backup.ts')
    return JSON.stringify(await buildBackup())
  })
  await other.close()
  return backup
}

async function seed(page: Page, key: string, files: Record<string, string>) {
  await page.addInitScript(
    ([k, entries]) => {
      if (localStorage.getItem(k)) return
      const folder: Record<string, { text: string; modified: number }> = {}
      for (const [name, text] of Object.entries(entries)) folder[name] = { text, modified: Date.now() }
      localStorage.setItem(k, JSON.stringify(folder))
    },
    [key, files] as const,
  )
}

test('the copy step says where the copy goes, needs no choice, and Next moves on', async ({ page }) => {
  await page.goto('/')
  const w = await openCopyStep(page)
  await expect(w.getByTestId('setup-copy')).toContainText(
    "RepBunny saves a copy of your workouts to iCloud Drive › RepBunny after every workout, so a lost phone doesn't mean lost workouts.",
  )
  await expect(w.getByText('Safe even if you lose this phone')).toBeVisible()
  await expect(w.getByTestId('setup-copy-local')).toHaveCount(0)
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'How do you want to train?' })).toBeVisible()
  await w.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(w).toHaveCount(0)

  const data = await openAccountSection(page, 'Your data')
  await expect(data.getByTestId('auto-copy-row-caption')).toHaveText('Saving to iCloud Drive › RepBunny after every workout')
})

test('a phone-only default says so and points at a cloud folder', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('backup-folder-web-default', JSON.stringify({ name: 'Documents › RepBunny', local: true })))
  await page.goto('/')
  const w = await openCopyStep(page)
  await expect(w.getByTestId('setup-copy')).toContainText('to Documents › RepBunny after every workout')
  await expect(w.getByTestId('setup-copy-local')).toHaveText(
    'This copy stays on this phone. Pick a cloud folder in Account › Your data to protect against losing it.',
  )
})

test("Don't keep a copy asks first, and Keep a copy turns it back on", async ({ page }) => {
  await page.goto('/')
  const w = await openCopyStep(page)
  await w.getByRole('button', { name: "Don't keep a copy" }).click()
  const confirm = page.getByRole('dialog', { name: 'Turn off the copy?' })
  await confirm.getByRole('button', { name: 'Keep a copy' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(w.getByTestId('setup-copy')).toContainText('iCloud Drive › RepBunny')

  await w.getByRole('button', { name: "Don't keep a copy" }).click()
  await confirm.getByRole('button', { name: 'Turn it off' }).click()
  await expect(w.getByTestId('setup-copy')).toContainText('The automatic copy is off.')
  await w.getByRole('button', { name: 'Keep a copy' }).click()
  await expect(w.getByTestId('setup-copy')).toContainText('to iCloud Drive › RepBunny after every workout')

  await w.getByRole('button', { name: "Don't keep a copy" }).click()
  await confirm.getByRole('button', { name: 'Turn it off' }).click()
  await w.getByRole('button', { name: 'Next' }).click()
  await w.getByRole('button', { name: 'Skip', exact: true }).click()
  const data = await openAccountSection(page, 'Your data')
  await expect(data.getByTestId('auto-copy-row-caption')).toHaveText('Off')
})

test('Change folder on the copy step uses the picked folder', async ({ page }) => {
  await page.goto('/')
  const w = await openCopyStep(page)
  await w.getByRole('button', { name: 'Change folder' }).click()
  await expect(w.getByTestId('setup-copy')).toContainText('to RepBunny after every workout')
})

test('a new install whose folder holds copies offers the latest one on the welcome screen', async ({ page }) => {
  const templateName = `E2E Copy Reinstall ${Date.now()}`
  const backup = await backupFrom(page, templateName)
  await seed(page, DEFAULT_FILES, { 'RepBunny backup.json': backup })
  await page.goto('/')
  const w = wizard(page)
  const offer = w.getByTestId('setup-copy-offer')
  await expect(offer.getByRole('heading', { name: /^Restore your workouts from .+\?$/ })).toBeVisible()
  await expect(offer).toContainText('RepBunny found your copy in iCloud Drive › RepBunny. 0 workouts.')
  await expect(w.getByRole('button', { name: 'Had RepBunny before? Find my copies' })).toHaveCount(0)

  // See all copies lists them; Back returns to the welcome.
  await offer.getByRole('button', { name: 'See all copies' }).click()
  const copies = page.getByRole('dialog', { name: 'Your copies' })
  await expect(copies.getByRole('button', { name: /^Latest copy/ })).toBeVisible()
  await copies.getByRole('button', { name: 'Back' }).click()
  await expect(copies).toHaveCount(0)

  await offer.getByRole('button', { name: 'Restore my workouts' }).click()
  const preview = page.getByRole('dialog', { name: 'Restore this backup?' })
  await preview.getByLabel('Type RESTORE to confirm').fill('RESTORE')
  await preview.getByRole('button', { name: 'Replace with this backup' }).click()
  // A cold dev server can reload the page right after the restore (#524);
  // see setup-wizard.spec.ts.
  const restored = page.getByRole('dialog', { name: 'Backup restored' })
  await expect(restored.or(page.getByRole('button', { name: templateName, exact: true })).first()).toBeVisible()
  if (await restored.isVisible()) await restored.getByRole('button', { name: 'Done' }).click({ timeout: 5000 }).catch(() => {})
  await expect(wizard(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
})

test('Find my copies picks the old folder, lists its copies, and keeps it for the copy', async ({ page }) => {
  const templateName = `E2E Copy Find ${Date.now()}`
  const backup = await backupFrom(page, templateName)
  await seed(page, FILES, { 'RepBunny backup.json': backup, 'notes.txt': 'not a copy' })
  await page.goto('/')
  const w = wizard(page)
  await expect(w.getByTestId('setup-copy-offer')).toHaveCount(0)
  await w.getByRole('button', { name: 'Had RepBunny before? Find my copies' }).click()
  const copies = page.getByRole('dialog', { name: 'Your copies' })
  await expect(copies).toContainText('Pick the one to bring back.')
  await expect(copies.getByRole('listitem')).toHaveCount(1)
  await copies.getByRole('button', { name: /^Latest copy/ }).click()
  const preview = page.getByRole('dialog', { name: 'Restore this backup?' })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('Latest copy')
  await preview.getByRole('button', { name: 'Cancel' }).click()
  await expect(preview).toHaveCount(0)

  // The picked folder is now the copy's folder.
  await w.getByRole('button', { name: 'Skip setup' }).click()
  const data = await openAccountSection(page, 'Your data')
  await expect(data.getByTestId('auto-copy-row-caption')).toHaveText('Saving to RepBunny after every workout')
})
