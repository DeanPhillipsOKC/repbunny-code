// Issue #264: the "When" field that backdates a workout or moves one to
// another date. A `datetime-local` input works in the phone's local time, as
// "YYYY-MM-DDTHH:MM", with no time zone.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDateTimeInputValue(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Null for an empty or unreadable field.
export function dateTimeInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number)
  const date = new Date(y, mo - 1, d, h, mi)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// Why the field can't be saved, or null when it can.
export function workoutDateProblem(value: string, now: Date = new Date()): string | null {
  const iso = dateTimeInputToIso(value)
  if (!iso) return 'Pick a date and time.'
  // The field has no seconds, so this minute still counts as now.
  if (new Date(iso).getTime() > now.getTime()) return "That's still to come. Pick a time that's already happened."
  return null
}

// A past workout's form starts at yesterday, on the hour.
export function defaultPastWorkoutTime(now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  d.setMinutes(0, 0, 0)
  return toDateTimeInputValue(d)
}
