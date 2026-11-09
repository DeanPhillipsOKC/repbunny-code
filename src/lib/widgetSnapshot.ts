import type { BodyWeightEntryLike } from './bodyStats'
import { recordSets } from './milestones'
import type { ProgressSetRow } from './progressHub'
import { startOfWeek } from './progressHub'
import { formatSetLabel } from './setLabel'
import type { Theme } from './theme'
import type { LoadType } from './types'

// Issue #144 (Premium, native apps): what the home screen widgets show. The
// app builds this after each workout and theme change (lib/homeWidgets.ts)
// and hands it to the native side as JSON; widgets never read the database.
// Every string is ready to draw, so the native side has no copy of its own.
// Pure, so e2e/widget-snapshot-unit.spec.ts covers it.

export type WidgetDayMark = 'paw' | 'candy-corn' | 'maple-leaf' | 'carrot' | 'candy-cane' | 'candy-heart'

export interface WidgetSnapshot {
  version: 1
  premium: boolean
  colors: {
    surface: string
    border: string
    text: string
    textDim: string
    accent: string
    accentText: string
  }
  dayMark: WidgetDayMark
  week: {
    // Sunday 12:00 AM local, in ms. Past the week's end the widget shows an
    // empty week until the app writes a new snapshot.
    start: number
    count: number
    label: string
    days: boolean[]
  }
  // The template you'd most likely do next; null with no templates.
  next: { templateId: string; name: string; sub: string } | null
  record: { exerciseName: string; detail: string; date: string } | null
  copy: {
    weekTitle: string
    nextTitle: string
    nextEmpty: string
    nextEmptySub: string
    start: string
    recordTitle: string
    recordEmpty: string
    recordEmptySub: string
    premiumTitle: string
    premiumText: string
  }
}

export interface WidgetTemplate {
  id: string
  name: string
  sub: string
}

export interface WidgetSnapshotInput {
  now: Date
  premium: boolean
  theme: Theme
  // Every logged set (the progress-set fetch), finished workouts only.
  sets: ProgressSetRow[]
  // Active templates in the order Home shows them.
  templates: WidgetTemplate[]
  exerciseNames: Map<string, string>
  loadTypeOf: (exerciseId: string) => LoadType
  bodyWeightEntries?: BodyWeightEntryLike[]
}

// Days (Sunday first) with a workout this week, and how many workouts.
export function weekMarks(sets: ProgressSetRow[], now: Date): { start: number; count: number; days: boolean[] } {
  const start = startOfWeek(now)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const days = [false, false, false, false, false, false, false]
  const workouts = new Set<string>()
  for (const s of sets) {
    const at = new Date(s.performed_at)
    if (at < start || at >= end) continue
    workouts.add(s.workout_id)
    days[at.getDay()] = true
  }
  return { start: start.getTime(), count: workouts.size, days }
}

// The template after the one you did last, in Home's order, wrapping around.
// With no templated workout yet (or its template archived), the first one.
export function pickNextTemplate<T extends { id: string }>(sets: ProgressSetRow[], templates: T[]): T | null {
  if (templates.length === 0) return null
  let latest: ProgressSetRow | null = null
  for (const s of sets) {
    if (!s.template_id) continue
    if (!latest || new Date(s.performed_at).getTime() > new Date(latest.performed_at).getTime()) latest = s
  }
  const index = latest ? templates.findIndex((t) => t.id === latest!.template_id) : -1
  return templates[(index + 1) % templates.length]
}

// The newest set that beat its exercise's best, by the milestones replay
// (same rule as the record celebration).
export function latestRecord(
  sets: ProgressSetRow[],
  loadTypeOf: (exerciseId: string) => LoadType,
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): ProgressSetRow | null {
  const records = recordSets(sets, loadTypeOf, bodyWeightEntries)
  return records[records.length - 1] ?? null
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const { theme } = input
  const week = weekMarks(input.sets, input.now)
  const next = pickNextTemplate(input.sets, input.templates)
  const record = latestRecord(input.sets, input.loadTypeOf, input.bodyWeightEntries)
  return {
    version: 1,
    premium: input.premium,
    colors: {
      surface: theme.tokens['--surface'],
      border: theme.tokens['--border'],
      text: theme.tokens['--text'],
      textDim: theme.tokens['--text-dim'],
      accent: theme.tokens['--accent'],
      accentText: theme.tokens['--accent-text'],
    },
    dayMark: theme.decor?.dayMark ?? 'paw',
    week: { ...week, label: week.count === 1 ? 'workout' : 'workouts' },
    next: next ? { templateId: next.id, name: next.name, sub: next.sub } : null,
    record: record
      ? {
          exerciseName: input.exerciseNames.get(record.exercise_id) ?? 'Exercise',
          detail: formatSetLabel(input.loadTypeOf(record.exercise_id), record.reps, record.weight, record.weight_unit, record.level),
          date: shortDate(record.performed_at),
        }
      : null,
    copy: {
      weekTitle: 'This week',
      nextTitle: 'Next workout',
      nextEmpty: 'No routines yet',
      nextEmptySub: 'Tap to make one',
      start: 'Start',
      recordTitle: 'Latest record',
      recordEmpty: 'No records yet',
      recordEmptySub: 'Beat a best to see it here',
      premiumTitle: 'Premium',
      premiumText: "Widgets come with Premium. Tap to see what's included.",
    },
  }
}
