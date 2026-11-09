// #987: art tiles for routines on Log home.
export default {
  issue: 987,
  title: ['Routine', 'art tiles'],
  note: 'Your routines on the Log screen now show the bunny doing a move that fits each one. Push day gets a press, leg day gets a squat, and Freeform gets a towel wave. Minimal mascot mode keeps the simple icons.',
  spoken: '[warm, playful] Your routines now show the bunny doing a move that fits each one.',
  prepare: async (page, kit) => {
    await kit.quietRest(page, { rest: false })
    await kit.seed(page, { premium: false })
  },
  lines: {
    tiles: 'Under What are you training today, each routine has its own art. Leg day gets a squat.',
    freeform: 'Freeform gets the bunny with her towel.',
    start: '[cheerful] Tap a tile, like Push day, and the workout starts right away.',
  },
  demo: async (page, { say, tap, sleep, reveal }) => {
    const picker = page.getByRole('group', { name: 'What are you training today?' })
    await say('tiles', () => reveal(picker, 'start'), 0.3)
    await sleep(800)
    const poster = Date.now() / 1000
    await say('freeform', () => reveal(picker.getByRole('button', { name: 'Freeform', exact: true }), 'center'), 0.3)
    await say('start', () => tap(picker.getByRole('button', { name: 'Push day', exact: true })), 0.6)
    await sleep(1500)
    return poster
  },
}
