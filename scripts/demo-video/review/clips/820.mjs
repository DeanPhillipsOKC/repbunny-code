// #820: the Workout log groups workouts under one header per day, and each
// card shows its time.
export default {
  issue: 820,
  title: ['One day,', 'one header'],
  note: 'The Workout log now groups workouts by day. Two workouts on the same day sit together under one header, and each card shows its start time.',
  spoken: '[warm, friendly] Trained twice in one day? The Workout log now keeps them together.',
  // The newest workout gets a second one an hour earlier on the same day.
  prepare: (page, kit) =>
    kit.seed(page, {
      premium: false,
      edit: (backup) => {
        const last = backup.workouts.at(-1)
        const earlier = backup.workouts.at(-2)
        earlier.performed_at = new Date(new Date(last.performed_at).getTime() - 90 * 60 * 1000).toISOString()
        if (earlier.finished_at) earlier.finished_at = new Date(new Date(earlier.performed_at).getTime() + 45 * 60 * 1000).toISOString()
      },
    }),
  lines: {
    open: 'Open the Progress tab, and tap Workout log.',
    header: 'Each day gets one header, with a count when you trained more than once.',
    time: 'Tap the Collapse button, and the cards under it show just the start time and how long it took.',
  },
  demo: async (page, { say, tap, sleep, nav, zoom, unzoom }) => {
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 500)
      await tap(page.getByRole('link', { name: 'Workout log', exact: true }))
    }, 0.3)
    const day = page.getByTestId('workout-day').first()
    const poster = Date.now() / 1000
    await say('header', () => zoom(day.getByRole('heading', { level: 2 }), 2), 0.4)
    await say('time', async () => {
      await unzoom()
      await tap(day.getByRole('button', { name: 'Collapse details' }))
      await zoom(day, 1.2)
      await sleep(600)
    }, 0.3)
    await sleep(1000)
    return poster
  },
}
