// #536: "Do this again" on Home repeats the last freeform workout.
export default {
  issue: 536,
  title: ['Do this', 'again'],
  note: 'Want the same session again? After a freeform workout, Home offers Do this again: same exercises in the same order, one open row per set you logged, filled in from last time.',
  spoken: 'Want the same session again? After a freeform workout, Home offers Do this again. You get the same exercises in the same order, filled in from last time.',
  prepare: async (page, kit) => {
    await kit.quietRest(page, { rest: false })
    await kit.seed(page, {
      // Make the most recent workout freeform so Home offers the button.
      edit: (backup) => {
        backup.workouts.at(-1).template_id = null
      },
    })
  },
  lines: {
    offer: 'Your last workout was freeform, so Home offers a Do this again button.',
    start: 'Tap Do this again.',
    rows: 'Same exercises, with one open row for each set you logged, already filled in from last time.',
  },
  demo: async (page, { say, tap, reveal }) => {
    const again = page.getByRole('button', { name: /Do this again/ })
    await say('offer', () => reveal(again), 0.3)
    await say('start', () => tap(again, 1200), 0.5)
    const poster = Date.now() / 1000
    await say('rows', () => reveal(page.getByLabel('Reps').first()), 0.2)
    return poster
  },
}
