import { test, expect } from '@playwright/test'
import { stripTags } from '../scripts/demo-video/narration.mjs'

// Issue #648: narration lines carry eleven_v4 audio tags ("[warm] Hey."),
// which the voice acts out. Captions, cards, and issue text are built from the
// same lines, so they must never show a bracket.

test('tags come out of captions with the spacing they leave', () => {
  expect(stripTags("[warm] Hey, I'm Dean.")).toBe("Hey, I'm Dean.")
  expect(stripTags('[pleased] Done. [casual] Head back to Home.')).toBe('Done. Head back to Home.')
  expect(stripTags('hides a real record, [wry] or invents a fake one.')).toBe('hides a real record, or invents a fake one.')
  expect(stripTags('Small stuff counts [chuckles].')).toBe('Small stuff counts.')
  expect(stripTags('[warm, friendly]  Two  spaces')).toBe('Two spaces')
})

test('a line with no tags is unchanged', () => {
  expect(stripTags('Tap the Add set button.')).toBe('Tap the Add set button.')
})
