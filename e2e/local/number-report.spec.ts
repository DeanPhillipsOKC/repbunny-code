import { test, expect } from '@playwright/test'

// Issue #574: openNumberReport() opens Report a bug with the description
// already written (what a receipt's "This looks wrong" does). The text stays
// editable and Email report builds a mailto: body that starts with it.

test.use({ viewport: { width: 375, height: 800 } })

test('"This looks wrong" opens Report a bug pre-filled, editable, and sends it first', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await page.evaluate(() => {
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (!this.href.startsWith('mailto:')) return click.call(this)
      ;(window as unknown as { mailto?: string }).mailto = this.href
    }
  })

  await page.evaluate(async () => {
    const { openNumberReport } = await window.__rbImport('/src/lib/accountSheet.ts')
    const { numberReportText } = await window.__rbImport('/src/lib/bugReport.ts')
    openNumberReport(
      numberReportText({
        screen: 'Barbell Bench Press › Est. 1RM chart',
        shown: '190 lb on Oct 12',
        from: '150 lb × 8 (set 1)',
        rule: 'Epley, 150 × (1 + 8 ÷ 30)',
        extra: ['Other sets that day: 150 × 8, 150 × 7'],
        unit: 'lb (no converted sets)',
      }),
    )
  })

  const sheet = page.getByRole('dialog', { name: 'Report a bug' })
  const box = sheet.getByRole('textbox', { name: /What happened/ })
  await expect(box).toHaveValue(/^A number looks wrong\.\nScreen: Barbell Bench Press › Est\. 1RM chart\nShown: 190 lb on Oct 12\nWorked out from: 150 lb × 8 \(set 1\)\nRule: Epley/)
  await expect(box).toHaveValue(/Unit: lb \(no converted sets\)\n\nWhat did you expect\?\n$/)
  await expect(sheet.getByText('Nothing is sent until you tap Send in your email app.')).toBeVisible()

  await box.press('Control+End')
  await box.pressSequentially('About 175.')
  await sheet.getByRole('button', { name: 'Email report' }).click()
  const href = await page.evaluate(() => (window as unknown as { mailto?: string }).mailto)
  const body = new URL(href!).searchParams.get('body') ?? ''
  expect(body).toContain('What happened:\nA number looks wrong.')
  expect(body).toContain('What did you expect?\nAbout 175.')
})
