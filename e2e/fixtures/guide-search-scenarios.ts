// Issue #569: questions real lifters type into Help & guides, in their own
// words (typos and loose phrasing kept on purpose), and the guide that should
// answer each. e2e/guide-search-scenarios-unit.spec.ts runs them through the
// real search and fails if a covered question drops out of the top 3.
//
// `want` lists every guide that answers the question; any of them in the top
// 3 counts. `gap` marks a question no guide answers yet: it isn't scored,
// and names the issue proposing that guide. When the guide ships, swap `gap`
// for `want`.
//
// Re-run the review after changing guides or src/lib/guideSynonyms.ts:
//   GUIDE_SEARCH_REPORT=1 npx playwright test e2e/guide-search-scenarios-unit.spec.ts --project=unit
// prints each question's top 3 and the hit rate per level.

export type Level = 'beginner' | 'intermediate' | 'advanced'

export type Scenario = { level: Level; query: string } & ({ want: string[] } | { gap: string })

const beginner = (query: string, want: string[] | { gap: string }): Scenario =>
  Array.isArray(want) ? { level: 'beginner', query, want } : { level: 'beginner', query, ...want }
const intermediate = (query: string, want: string[] | { gap: string }): Scenario =>
  Array.isArray(want) ? { level: 'intermediate', query, want } : { level: 'intermediate', query, ...want }
const advanced = (query: string, want: string[] | { gap: string }): Scenario =>
  Array.isArray(want) ? { level: 'advanced', query, want } : { level: 'advanced', query, ...want }

export const SCENARIOS: Scenario[] = [
  // Beginner: knows how to log a set, not much more.
  beginner('how do i fix a set i entered wrong', ['log-a-workout', 'edit-past-workouts']),
  beginner('where do my old workouts go', ['edit-past-workouts']),
  beginner('delete a set', ['log-a-workout', 'edit-past-workouts']),
  beginner('forgot to log yesterdays workout', ['edit-past-workouts']),
  beginner('how long should i rest', ['rest-timer', 'lifting-basics']),
  beginner('turn off rest timer', ['rest-timer']),
  beginner('what is rpe', ['lifting-basics', 'next-set-targets']),
  beginner('how many plates on each side', ['plate-calculator']),
  beginner('add another exercise during workout', ['log-a-workout']),
  beginner('how do i end my workout', ['log-a-workout']),
  beginner('dark mode', ['themes']),
  beginner('workout has the wrong date', ['edit-past-workouts']),
  beginner('app crashed', ['report-a-bug']),
  beginner('pushups with no weight', ['load-types']),
  beginner('what weight should i start with', ['lifting-basics', 'next-set-targets']),
  beginner('backup my workouts', ['partial-backups']),
  beginner('started the wrong workout', ['log-a-workout']),
  beginner('timer alert when phone is locked', ['rest-timer']),
  beginner('see my personal records', ['exercise-history', 'progress-reports']),
  beginner('change kg to lbs', ['weight-unit']),
  beginner('log my body weight', ['body-weight']),

  // Intermediate: uses routines and the rest timer.
  intermediate('swap an exercise for today only', ['swap-exercises']),
  intermediate("start from last time's numbers", ['log-a-workout', 'next-set-targets']),
  intermediate('reorder exercises in my routine', ['routines']),
  intermediate('rename a routine', ['routines']),
  intermediate('save freeform workout as a routine', ['routines']),
  intermediate('the machine is taken', ['swap-exercises']),
  intermediate('warmup sets', ['next-set-targets']),
  intermediate('diffrent rest time for squats', ['rest-timer']),
  intermediate('push pull legs program', ['starter-programs']),
  intermediate('get rid of a routine', ['routines']),
  intermediate('seat height notes', ['log-a-workout']),
  intermediate('what does next time mean', ['exercise-history', 'next-set-targets']),
  intermediate('deload', ['next-set-targets']),
  intermediate('move my data from hevy', ['import-from-strong-hevy']),
  intermediate('plank timer', ['load-types']),
  intermediate('how many sets per exercise in a routine', ['routines']),
  intermediate('next workout on my home screen', ['home-screen-widgets']),
  intermediate('merge duplicate exercises', ['merge-exercises']),
  intermediate('training calendar', ['training-calendar']),

  // Advanced: knows Preferences, Est. 1RM, and the reports.
  advanced('why is my est 1rm lower than my best set', ['exercise-history']),
  advanced('how are volume totals counted for timed sets', ['load-types', 'progress-reports']),
  advanced('export pdf for my coach', ['progress-reports']),
  advanced('year in review', ['progress-reports']),
  advanced('strength standards male female', ['strength-levels']),
  advanced('link my own exercise to the library', ['strength-levels']),
  advanced('rep max table', ['exercise-history']),
  advanced('does sleep affect my lifts', ['workout-feel']),
  advanced('what counts as a strong week', ['milestones']),
  advanced('how do i use a trial pass', ['milestones']),
  advanced('change the rest chime sound', ['extras']),
  advanced('export measurements csv', ['body-measurements']),
  advanced('restore only my routines', ['partial-backups']),
  advanced('change the app icon', ['themes']),
  advanced('machine level volume', ['load-types']),
  advanced('stalled on bench', ['next-set-targets']),
  advanced('do warmup sets count as prs when importing', ['import-from-strong-hevy']),
  advanced('ez curl bar weight', ['plate-calculator']),
  advanced('rpe based progression', ['next-set-targets']),
  advanced('hide the bunny', ['themes']),
  advanced('restore points', ['restore-points']),
  advanced('am i training push and pull evenly', ['muscle-groups']),
]
