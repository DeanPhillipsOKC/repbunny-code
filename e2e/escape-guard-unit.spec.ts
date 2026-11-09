import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Issue #783: back on Android is an Escape keydown sent to the topmost
// [role="dialog"], so every component that renders a dialog must handle
// Escape. A new sheet fails here until it calls useEscapeClose (or has its own
// Escape handling), or is listed below with the reason it stays open.
const DIR = join(process.cwd(), 'src', 'components')

// Dialogs that deliberately ignore Escape.
const STAYS_OPEN: Record<string, string> = {
  'WeightUnitSheet.vue': 'first-run unit picker: a choice is required (androidBack.ts)',
  'SetupWizard.vue': 'first-run setup: finishing is required',
  'UnlockCelebration.vue': 'handled by its own Escape listener',
}

test('every component with a dialog closes on Escape', () => {
  const missing: string[] = []
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.vue'))) {
    const src = readFileSync(join(DIR, file), 'utf8')
    if (!src.includes('role="dialog"')) continue
    if (file in STAYS_OPEN) continue
    if (/useEscapeClose\(|'Escape'|keydown\.esc/.test(src)) continue
    missing.push(file)
  }
  expect(missing, 'dialogs that ignore Escape (so Android back does nothing)').toEqual([])
})
