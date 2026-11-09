import { dayKey } from './trainingCalendar'

// Issue #820: the Workout log groups workouts under one header per local
// calendar day, so two on the same day don't look like two different days.

export interface WorkoutDay<T> {
  key: string
  label: string
  entries: T[]
}

// "Today", "Yesterday", or "Fri, Oct 23" (with the year only when it isn't this year).
export function dayLabel(date: Date, now: Date = new Date()): string {
  const key = dayKey(date)
  if (key === dayKey(now)) return 'Today'
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (key === dayKey(yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

// Keeps the list's order (newest first) and groups neighbours by local day.
export function groupWorkoutDays<T extends { performed_at: string }>(entries: T[], now: Date = new Date()): WorkoutDay<T>[] {
  const days: WorkoutDay<T>[] = []
  for (const entry of entries) {
    const date = new Date(entry.performed_at)
    const key = dayKey(date)
    const last = days[days.length - 1]
    if (last && last.key === key) last.entries.push(entry)
    else days.push({ key, label: dayLabel(date, now), entries: [entry] })
  }
  return days
}

// The card heading inside a day group: "5:26 PM".
export function formatLogTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// The full date and time, for the date editor's label and the delete dialog.
export function formatLogDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
