import { test, expect, type Page } from '@playwright/test'
import { accountMenu } from '../fixtures/account'

// Issue #84 in local mode (the native apps): Report a bug lists the errors on
// the device newest first, the last 24 hours start checked, and the report
// carries only what's checked. Email report opens a mailto: link addressed to
// support; the link's click is caught so the test can read what the email
// app would have been handed.

test.use({ viewport: { width: 375, height: 800 } })

type Mail = { to: string; subject: string; body: string }

async function seedErrors(page: Page) {
  await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const base = { kind: 'error', stack: null, context: null, app_version: 'test', user_agent: null } as const
    await repos.clientErrors.insert({
      ...base,
      occurred_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      message: 'old boom from last week',
      route: '/templates',
    })
    await repos.clientErrors.insert({
      ...base,
      occurred_at: new Date(Date.now() - 60 * 1000).toISOString(),
      message: 'recent boom\nsecond line stays out of the row',
      route: '/progress/workouts',
    })
  })
}

async function catchMailto(page: Page) {
  await page.evaluate(() => {
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (!this.href.startsWith('mailto:')) return click.call(this)
      ;(window as unknown as { mailto?: string }).mailto = this.href
    }
  })
}

async function sentMail(page: Page): Promise<Mail> {
  const href = await page.evaluate(() => (window as unknown as { mailto?: string }).mailto)
  expect(href).toBeTruthy()
  const url = new URL(href!)
  return { to: decodeURIComponent(url.pathname), subject: url.searchParams.get('subject') ?? '', body: url.searchParams.get('body') ?? '' }
}

async function openReport(page: Page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await accountMenu(page).getByRole('group', { name: 'About' }).getByRole('button', { name: 'Report a bug' }).click()
  const sheet = page.getByRole('dialog', { name: 'Report a bug' })
  await expect(sheet).toBeVisible()
  return sheet
}

test('Report a bug lists device errors, sends only the checked ones, and clears the log', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seedErrors(page)
  await catchMailto(page)

  const sheet = await openReport(page)
  const boxes = sheet.getByRole('group', { name: 'Logged errors' }).getByRole('checkbox')
  const rows = sheet.locator('.error-row')
  await expect(boxes).toHaveCount(2)

  // Newest first, with the screen and only the message's first line.
  await expect(rows.nth(0)).toContainText(/Today .* · Progress/)
  await expect(rows.nth(0)).toContainText('recent boom')
  await expect(rows.nth(0)).not.toContainText('second line')
  await expect(rows.nth(1)).toContainText('old boom from last week')
  await expect(boxes.nth(0)).toBeChecked()
  await expect(boxes.nth(1)).not.toBeChecked()

  // Select all, then uncheck the recent one: only the old one goes out.
  await sheet.getByRole('button', { name: 'Select all' }).click()
  await expect(boxes.nth(1)).toBeChecked()
  await rows.nth(0).click()
  await expect(boxes.nth(0)).not.toBeChecked()

  await sheet.getByLabel(/What happened/).fill('Templates froze after I tapped save')
  await sheet.getByRole('button', { name: 'Email report' }).click()

  await expect(accountMenu(page)).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Thanks for the report')
  const mail = await sentMail(page)
  expect(mail.to).toBe('hello@repbunny.app')
  expect(mail.subject).toBe('RepBunny bug report')
  expect(mail.body).toContain('Templates froze after I tapped save')
  expect(mail.body).toContain('old boom from last week')
  expect(mail.body).toContain('Screen: /templates')
  expect(mail.body).toContain('Errors (1):')
  expect(mail.body).not.toContain('recent boom')
  expect(mail.body).toContain("Email me when it's fixed: no")

  // Sending left the log alone; Clear log empties it.
  await page.getByRole('status').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  await accountMenu(page).getByRole('button', { name: 'Report a bug' }).click()
  const again = page.getByRole('dialog', { name: 'Report a bug' })
  await expect(again.getByRole('group', { name: 'Logged errors' }).getByRole('checkbox')).toHaveCount(2)
  await again.getByRole('button', { name: 'Clear log' }).click()
  await expect(again.getByText('No errors recorded.')).toBeVisible()
  await expect(again.getByRole('button', { name: 'Clear log' })).toHaveCount(0)
  const left = await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    return (await repos.clientErrors.list()).data.length
  })
  expect(left).toBe(0)

  // With nothing logged, a description alone can still be sent.
  await expect(again.getByRole('button', { name: 'Email report' })).toBeDisabled()
  await again.getByLabel(/What happened/).fill('Just a note')
  await again.getByRole('button', { name: 'Email report' }).click()
  await expect(accountMenu(page)).toBeVisible()
  const noteOnly = await sentMail(page)
  expect(noteOnly.body).toContain('Just a note')
  expect(noteOnly.body).toContain('Errors: none included')
})

// The on-screen keyboard leaves only part of the screen. A short viewport
// stands in for it: with the text box focused, Email report must still be on
// screen without scrolling the sheet.
test('Email report stays in view while typing in a short viewport', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seedErrors(page)
  await page.setViewportSize({ width: 375, height: 420 })

  const sheet = await openReport(page)
  await expect(sheet.locator('.error-row')).toHaveCount(2)
  const box = sheet.getByLabel(/What happened/)
  await box.click()
  await box.fill('typing with the keyboard up')
  await expect(box).toBeInViewport()

  const send = sheet.getByRole('button', { name: 'Email report' })
  await expect(send).toBeInViewport({ ratio: 1 })
  const sendBox = (await send.boundingBox())!
  expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(420)
  const sheetBox = (await sheet.boundingBox())!
  expect(sheetBox.y).toBeGreaterThanOrEqual(0)
})

// "Email me when it's fixed" starts off, and only a check puts "yes" in the
// report. We reply either way; this only allows a later note about the fix.
test("Email me when it's fixed is off by default and checking it says yes in the report", async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await catchMailto(page)

  const sheet = await openReport(page)
  const followUp = sheet.getByRole('checkbox', { name: /Email me when it's fixed/ })
  await expect(followUp).not.toBeChecked()
  await expect(sheet.getByText('We reply to every report either way.')).toBeVisible()

  await sheet.getByText("Email me when it's fixed").click()
  await expect(followUp).toBeChecked()
  await sheet.getByLabel(/What happened/).fill('Please let me know')
  await sheet.getByRole('button', { name: 'Email report' }).click()
  await expect(accountMenu(page)).toBeVisible()
  const mail = await sentMail(page)
  expect(mail.body).toContain("Email me when it's fixed: yes")

  // A fresh sheet starts unchecked again.
  await page.getByRole('status').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  await accountMenu(page).getByRole('button', { name: 'Report a bug' }).click()
  await expect(page.getByRole('dialog', { name: 'Report a bug' }).getByRole('checkbox', { name: /Email me when it's fixed/ })).not.toBeChecked()
})
