// The lifting basics video's words (#426), apart from lifting-basics.mjs so
// guide-clips.mjs can keep these cached lines when it prunes unused ones.
// Rewording a line here re-voices only that line on the next render.

export const INTRO = ['Lifting', 'basics']
export const OUTRO = ['Ready for your', 'first set']
export const SETUP = "[warm, friendly] New to the gym? Here's what all those words mean, so you can walk in and know what to do."
// Concept cards in order: concept.html's kind and the lines said over it.
export const CONCEPTS = [
  ['rep', ['A rep is one lift, up and down. Like one squat.']],
  ['set', ['A set is a group of reps, done back to back.', 'Three by eight means three sets of eight reps.']],
  ['weight', [
    'Pick a weight where the last rep or two feel hard, while your form still holds.',
    "[reassuring] When you're not sure, go lighter. You can always add more next set.",
  ]],
  ['rest', ['Rest about one to three minutes between sets.', '[pleased] In RepBunny, the rest timer starts for you.']],
  ['rpe', ['RPE is how hard a set felt, from one to ten.', "If you could have done about two more reps, that's an eight.", '[casual] Logging it is optional.']],
  ['words', [
    "A few words you'll hear.",
    'A warm-up set is a lighter set, to get loose.',
    '[proud] A PR is a personal record, your best ever.',
    'And progressive overload just means adding a little over time.',
  ]],
]
// The app clip's lines, spoken by key.
export const APP = {
  weight: "[upbeat] Now let's log a set in RepBunny. Type the weight you lifted,",
  reps: 'and how many reps.',
  add: 'Then tap the Add set button.',
  nice: "[excited] That's one set done! Tap the Nice button to keep going.",
}
export const LINES = [SETUP, ...CONCEPTS.flatMap(([, lines]) => lines), ...Object.values(APP)]
