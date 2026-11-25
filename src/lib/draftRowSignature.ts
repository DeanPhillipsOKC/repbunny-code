// The fields a pre-fill writes into a draft row, as one string, so two rows
// (or one row at two moments) can be compared for "did anyone touch this".
export function rowSignature(row: {
  reps: unknown; weight: unknown; level: unknown; rpe: unknown
  durationInput: unknown; distance: unknown; incline: unknown; calories: unknown
}): string {
  return JSON.stringify([row.reps, row.weight, row.level, row.rpe, row.durationInput, row.distance, row.incline, row.calories])
}
