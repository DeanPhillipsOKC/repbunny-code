#!/usr/bin/env node
// Captures real app screenshots for marketing: the repbunny.app landing page
// (#58) and, later, App Store listing images (#35). Not part of the
// npm run test:e2e gate. It makes no assertions, it only captures state.
//
// Runs the app in local mode on a fresh on-device database, seeded with ten
// weeks of push/pull history with steady progress, so the progress chart and
// the record come from real app logic, and repeat runs give the same screens.
//
// Requires the dev server already running (npm run dev).
// Shots are iPhone 13 size at 3x, saved to logs/marketing/<timestamp>/.
// Seeding and the phone page are shared with capture-guide-screenshots.mjs
// (scripts/lib/sample-account.mjs).
//
// --play captures a 360x640 viewport instead (1080x1920 at 3x): Google Play
// wants phone screenshots no more than twice as tall as they are wide, which
// the iPhone 13 shape isn't (#198).
//
// Usage: node scripts/capture-marketing-screenshots.mjs [--play]

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_URL, openSamplePhone } from './lib/sample-account.mjs'

const play = process.argv.includes('--play')
const outDir = join('logs', play ? 'marketing-play' : 'marketing', String(Date.now()))
mkdirSync(outDir, { recursive: true })

const manifest = []

async function main() {
  const { browser, page } = await openSamplePhone('marketing-shots', {
    viewport: play ? { width: 360, height: 640 } : undefined,
  })

  async function shot(name) {
    await page.waitForTimeout(600)
    const file = `${name}.png`
    await page.screenshot({ path: join(outDir, file) })
    manifest.push(file)
  }

  // One failed screen shouldn't lose the rest; save what the page looked like.
  async function step(name, fn) {
    try {
      await fn()
    } catch (err) {
      console.error(`capture-marketing-screenshots: ${name} failed: ${err.message}`)
      await page.screenshot({ path: join(outDir, `fail-${name}.png`) })
    }
  }

  async function waitForOverlay(selector) {
    return page.locator(selector).waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)
  }

  const nav = page.getByRole('navigation', { name: 'Primary' })

  try {
    await page.goto(BASE_URL)
    await nav.waitFor({ state: 'visible' })
    await shot('home')

    // Log three bench sets from the template, the last one a record. The
    // rest timer and the celebration are both worth keeping.
    await step('logging', async () => {
      await page.getByRole('button', { name: 'Push day', exact: true }).click()
      const start = page.getByRole('button', { name: 'Start workout' })
      if (await start.isVisible().catch(() => false)) await start.click()
      await page.locator('.exercise-card-name').waitFor({ state: 'visible' })
      await page.getByLabel('Weight').nth(2).fill('140')
      for (let i = 1; i <= 3; i++) {
        await page.getByRole('button', { name: 'Add set' }).first().click()
        if (await waitForOverlay('.celebration-overlay')) {
          await shot('record')
          await page.getByRole('button', { name: 'Nice!' }).click()
          await page.locator('.celebration-overlay').waitFor({ state: 'hidden' })
        }
        if (await waitForOverlay('.rest-overlay')) {
          if (i === 1) await shot('rest-timer')
          await page.getByRole('button', { name: 'Skip Rest' }).click()
          await page.locator('.rest-overlay').waitFor({ state: 'hidden' })
        }
      }
      // Finishing bench auto-advances to the next exercise; go back to it.
      await page.getByRole('button', { name: 'Bench press', exact: true }).first().click()
      await page.locator('.exercise-card-name', { hasText: 'Bench press' }).waitFor()
      await page.evaluate(() => window.scrollTo(0, 0))
      await shot('logging')
    })

    await step('load-types', async () => {
      await nav.getByRole('link', { name: 'Exercises', exact: true }).click()
      await page.getByLabel('Name').first().waitFor()
      await shot('exercises')
      await page
        .getByRole('group', { name: 'What does it work?' })
        .first()
        .getByRole('button', { name: 'Back', exact: true })
        .click()
      await page.getByLabel('Name').first().fill('Assisted dip')
      await page.getByRole('button', { name: 'Assisted', exact: true }).first().click()
      await page
        .getByRole('group', { name: 'How is it loaded?' })
        .first()
        .evaluate((el) => {
          el.scrollIntoView({ block: 'start' })
          window.scrollBy(0, -140)
        })
      await shot('load-types')
    })

    await step('progress', async () => {
      await nav.getByRole('link', { name: 'Progress', exact: true }).click()
      await page.getByRole('heading', { name: 'Progress', exact: true }).waitFor()
      await shot('progress-hub')
      await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
      await page.locator('.lift-row', { hasText: 'Bench press' }).click()
      await page.getByRole('dialog', { name: 'Bench press history' }).waitFor()
      await shot('progress-chart')
    })

    await step('templates', async () => {
      await page.goto(`${BASE_URL}/templates`)
      await page.getByText('Push day', { exact: true }).first().waitFor()
      await shot('templates')
    })
  } finally {
    await browser.close()
  }

  console.log(JSON.stringify({ outDir, screenshots: manifest }, null, 2))
}

main().catch((err) => {
  console.error(`capture-marketing-screenshots: ${err.message}`)
  process.exit(1)
})
