import { test, expect, type Page } from '@playwright/test'
import { accountMenu } from '../fixtures/account'

// Issue #100 in local mode: Request a feature, below Report a bug, emails one
// idea to support with the app version and device, and no error list. The
// mailto: link's click is caught so the test can read what the email app
// would have been handed (same as bug-report.spec.ts).

test.use({ viewport: { width: 375, height: 800 } })

async function catchMailto(page: Page) {
  await page.evaluate(() => {
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (!this.href.startsWith('mailto:')) return click.call(this)
      ;(window as unknown as { mailto?: string }).mailto = this.href
    }
  })
}

async function openRequest(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const about = accountMenu(page).getByRole('group', { name: 'About' })
  await expect(about.getByRole('button', { name: 'Report a bug' })).toBeVisible()
  await about.getByRole('button', { name: 'Request a feature' }).click()
  const sheet = page.getByRole('dialog', { name: 'Request a feature' })
  await expect(sheet).toBeVisible()
  return sheet
}

test('Request a feature emails the idea and version to support, with no errors', async ({ page }) => {
  const sheet = await openRequest(page)
  await catchMailto(page)

  const send = sheet.getByRole('button', { name: 'Email request' })
  await expect(send).toBeDisabled()
  await expect(sheet.getByText('Opens your email app addressed to hello@repbunny.app. Nothing is sent until you tap Send there.')).toBeVisible()
  const box = sheet.getByLabel('What would you like RepBunny to do?')
  await box.fill('   ')
  await expect(send).toBeDisabled()
  await box.fill('Let me tag workouts as deload weeks')
  await send.click()

  await expect(accountMenu(page)).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Thanks for the idea')
  const href = await page.evaluate(() => (window as unknown as { mailto?: string }).mailto)
  expect(href).toBeTruthy()
  const url = new URL(href!)
  expect(decodeURIComponent(url.pathname)).toBe('hello@repbunny.app')
  expect(url.searchParams.get('subject')).toBe('RepBunny feature request')
  const body = url.searchParams.get('body') ?? ''
  expect(body).toContain('Let me tag workouts as deload weeks')
  expect(body).toMatch(/App version: \S+/)
  expect(body).not.toContain('App version: unknown')
  expect(body).toContain('Platform: ')
  expect(body).not.toContain('Errors')
})

// The keyboard leaves only part of the screen; a short viewport stands in
// for it. With the box focused, Email request must be fully on screen.
test('Email request stays in view while typing in a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 420 })
  const sheet = await openRequest(page)
  const box = sheet.getByLabel('What would you like RepBunny to do?')
  await box.click()
  await box.fill('typing with the keyboard up')
  await expect(box).toBeInViewport()

  const send = sheet.getByRole('button', { name: 'Email request' })
  await expect(send).toBeInViewport({ ratio: 1 })
  const sendBox = (await send.boundingBox())!
  expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(420)
})
