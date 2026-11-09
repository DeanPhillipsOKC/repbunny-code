import { test, expect } from '@playwright/test'

// Issue #461: a custom exercise with a bar in its name gets the plate
// calculator by default, and the import review shows a match's equipment.
// The modules load JSON, so they run in the page rather than in Node.

test('name guess: bar keywords yes, other equipment no, an explicit choice wins', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { nameSuggestsBarbell, usesBarbell } = await window.__rbImport('/src/lib/plates.ts')
    const yes = ['Romanian Deadlift (Barbell)', 'Barbell Row', 'Trap Bar Deadlift', 'Hex bar shrug', 'EZ-Bar Curl', 'EZ Curl Bar Curl', 'Smith Machine Squat', 'Smith Squat']
    const no = ['Dumbbell Row', 'Romanian Deadlift (Dumbbell)', 'Kettlebell Swing', 'Cable Curl', 'Leg Press Machine', 'Barbell or Dumbbell Press', 'Bench Press', '']
    const base = { load_type: 'weight' as const, library_id: null, name: 'Romanian Deadlift (Barbell)' }
    return {
      yes: yes.filter((n) => !nameSuggestsBarbell(n)),
      no: no.filter((n) => nameSuggestsBarbell(n)),
      guessed: usesBarbell({ ...base, uses_barbell: null }),
      off: usesBarbell({ ...base, uses_barbell: false }),
      dumbbell: usesBarbell({ ...base, name: 'Dumbbell Row', uses_barbell: null }),
    }
  })
  expect(result).toEqual({ yes: [], no: [], guessed: true, off: false, dumbbell: false })
})

test('import: a new "Romanian Deadlift (Barbell)" gets the plate calculator, and a bar match shows its equipment', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { answerTarget, candidateSubline } = await window.__rbImport('/src/lib/importMatch.ts')
    const { usesBarbell } = await window.__rbImport('/src/lib/plates.ts')
    const source = { name: 'Romanian Deadlift (Barbell)', loadType: 'weight', tracksDistance: false } as never
    const target = answerTarget({ kind: 'new' }, source, 'strong', []) as { kind: string; row: { name: string } }
    const mine = (over: object) =>
      ({ kind: 'mine', score: 1, exercise: { id: 'a', name: 'Romanian Deadlift', load_type: 'weight', library_id: null, is_archived: false, muscle_group: 'legs', tracks_distance: false, ...over } }) as never
    const counts = new Map([['a', 12]])
    return {
      kind: target.kind,
      plates: usesBarbell({ load_type: 'weight', uses_barbell: null, library_id: null, name: target.row.name }),
      linked: candidateSubline(mine({ library_id: 'romanian_deadlift' }), counts),
      named: candidateSubline(mine({ name: 'Row (Barbell)' }), counts),
      plain: candidateSubline(mine({ name: 'Curl' }), counts),
    }
  })
  expect(result.kind).toBe('add')
  expect(result.plates).toBe(true)
  expect(result.linked).toMatch(/^Barbell · Legs · 12 sets logged$/)
  expect(result.named).toBe('Barbell · Legs · 12 sets logged')
  expect(result.plain).toBe('Legs · 12 sets logged')
})
