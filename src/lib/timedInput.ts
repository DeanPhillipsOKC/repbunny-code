// Backlog item 93: a timed set's duration is typed as bare digits with the
// colon filled in automatically, right-to-left like a stopwatch readout
// ("115" -> "1:15", "2000" -> "20:00") instead of requiring a literal colon
// keystroke. `formatDurationDigits` reformats the field's value on every
// keystroke; `parseDurationLabel` turns the resulting "m:ss" string into
// seconds for saving.
export function formatDurationDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  const seconds = digits.slice(-2).padStart(2, '0')
  const minutes = digits.slice(0, -2)
  return `${minutes === '' ? '0' : minutes}:${seconds}`
}

export function parseDurationLabel(label: string): number | null {
  const match = label.trim().match(/^(\d+):(\d{1,2})$/)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  if (seconds >= 60) return null
  const total = minutes * 60 + seconds
  return total > 0 ? total : null
}

export function formatSecondsAsClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
