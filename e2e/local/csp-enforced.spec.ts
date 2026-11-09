import { readFileSync } from 'node:fs'
import { test, expect, startLocal, seedExercise } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { installRestChimeSpy, chimeCount } from '../fixtures/restChime'
import { openAccountSection } from '../fixtures/account'

// Issue #541: the app's CSP in public/_headers is enforced, so this serves the
// local-mode app with that exact policy on every document response and walks
// the core flows (SQLite wasm, set logging, the rest chime clip, backup
// download) with a listener on `securitypolicyviolation`. Zero violations.
// Dev-server only needs: the Vite HMR socket is same-origin, which 'self' covers.

function appCsp(): string {
  const line = readFileSync('public/_headers', 'utf8')
    .split('\n')
    .find((l) => /^\s+Content-Security-Policy:/.test(l))
  if (!line) throw new Error('public/_headers has no enforced Content-Security-Policy')
  return line.replace(/^\s+Content-Security-Policy:\s*/, '').trim()
}

test('the enforced app CSP blocks nothing across the core local-mode flows', async ({ page }) => {
  const csp = appCsp()
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
  })
  const consoleCsp: string[] = []
  page.on('console', (m) => {
    if (/content security policy/i.test(m.text())) consoleCsp.push(m.text())
  })
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] }
    w.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`)
    })
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
  await installRestChimeSpy(page)
  await page.setViewportSize({ width: 375, height: 800 })

  await startLocal(page, { defaultRestSeconds: 2 })
  await seedExercise(page, 'CSP Press')

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, 'CSP Press', false)
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('5')
  await row.getByLabel('Weight').fill('100')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  // The rest runs out and plays the chime clip (fetched, then decoded).
  await expect.poll(() => chimeCount(page), { timeout: 15_000 }).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  const done = page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true })
  await done.click()

  const account = await openAccountSection(page, 'Your data')
  const download = page.waitForEvent('download')
  await account.getByRole('button', { name: /Back up my data/ }).click()
  await page.getByRole('dialog', { name: 'What to back up' }).getByRole('button', { name: 'Save backup' }).click()
  await download

  const violations = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)
  expect(violations).toEqual([])
  expect(consoleCsp).toEqual([])
})
