// #535: a note on one lift for just this workout ("Note for today").
export default {
  issue: 535,
  title: ['Note for', 'today'],
  note: 'Jot a note on a lift for just this workout: tap + Note for today under your sets. It shows under that exercise in your Workout log, and under Last time the next time you do the lift. Notes from Strong and Hevy imports land there too.',
  spoken: 'Jot a note on a lift for just this workout. Tap Note for today under your sets. It shows in your workout log, and under Last time when you do the lift again.',
  prepare: async (page, kit) => {
    await kit.quietRest(page, { rest: false })
    await kit.seed(page, {
      // Last Push day already has a note on the bench, so Last time shows one.
      edit: (backup) => {
        const last = backup.workouts.at(-1)
        backup.workout_exercise_notes = [{ workout_id: last.id, exercise_id: 'bench', note: 'Last rep was a grind. Pause at the chest next time.' }]
      },
    })
  },
  lines: {
    start: "Let's start Push day.",
    last: "Under Last time, there's the note from last week's bench.",
    open: 'To add one for today, tap the Note for today button.',
    write: 'Type how it went,',
    save: 'and tap the Save note button.',
    done: "It's saved with this workout, and shows up next time.",
  },
  demo: async (page, { say, tap, type, reveal }) => {
    await say('start', () => tap(page.getByRole('button', { name: 'Push day', exact: true }), 700), 0.4)
    const note = page.getByTestId('today-note').first()
    await say('last', () => reveal(page.getByText('Last rep was a grind', { exact: false }).first()), 0.2)
    await say('open', () => tap(note.getByRole('button', { name: '+ Note for today' })), 0.5)
    await say('write', () => type(note.getByLabel('Note for today'), 'Felt strong. Paused every rep.'), 0.2)
    const poster = Date.now() / 1000
    await say('save', () => tap(note.getByRole('button', { name: 'Save note' })), 0.4)
    await say('done')
    return poster
  },
}
