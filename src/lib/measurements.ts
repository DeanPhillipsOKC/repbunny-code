import { MEASUREMENT_SITES, type BodyMeasurement, type HeightUnit, type MeasurementSite, type MeasurementValues, type WeightUnit } from './types'

// Issue #139: body measurements next to weigh-ins (Premium, feature key
// `progress`). Each entry is in the unit it was logged in; screens convert
// to the display unit, which follows the weight unit (lb to in, kg to cm)
// until the user switches it on the Body screen.

export const SITE_LABELS: Record<MeasurementSite, string> = {
  waist: 'Waist',
  chest: 'Chest',
  hips: 'Hips',
  arms: 'Arms',
  thighs: 'Thighs',
  neck: 'Neck',
}

// The "How to measure" sheet and the guide share this copy.
export const MEASURE_TIPS: Record<MeasurementSite, string> = {
  waist: 'At your belly button. Breathe out normally and measure before you suck in.',
  chest: 'Around the fullest part, under your armpits and across your nipples, arms down.',
  hips: 'Around the widest part of your butt, feet together.',
  arms: 'Around the biggest part of your upper arm, relaxed and hanging at your side. Same arm every time.',
  thighs: 'Around the biggest part of one thigh, just under your glutes, standing. Same leg every time.',
  neck: 'Just below your Adam’s apple, or the middle of your neck, looking straight ahead.',
}

export const MEASURE_HABITS = [
  'Use a soft tape, snug on the skin but not pressing in.',
  'Keep the tape level all the way around. A mirror helps.',
  'Measure at the same time of day, ideally in the morning before eating or training.',
  'Every 2 to 4 weeks is plenty. Tape numbers move slowly.',
]

const CM_PER_IN = 2.54

export function convertLength(value: number, from: HeightUnit, to: HeightUnit): number {
  if (from === to) return value
  return from === 'in' ? value * CM_PER_IN : value / CM_PER_IN
}

export function roundLength(value: number): number {
  return Math.round(value * 10) / 10
}

export function lengthUnitFor(weightUnit: WeightUnit): HeightUnit {
  return weightUnit === 'kg' ? 'cm' : 'in'
}

// Per device: the display unit the user picked, or null to follow the
// weight unit.
const UNIT_KEY = 'repbunny-measure-unit'

export function readMeasureUnit(): HeightUnit | null {
  try {
    const value = localStorage.getItem(UNIT_KEY)
    return value === 'in' || value === 'cm' ? value : null
  } catch {
    return null
  }
}

export function writeMeasureUnit(unit: HeightUnit) {
  try {
    localStorage.setItem(UNIT_KEY, unit)
  } catch {
    // best-effort; the pick still holds until reload
  }
}

export function emptyValues(): MeasurementValues {
  return { waist: null, chest: null, hips: null, arms: null, thighs: null, neck: null }
}

export function hasAnyValue(values: MeasurementValues): boolean {
  return MEASUREMENT_SITES.some((site) => values[site] !== null && values[site] !== undefined)
}

// Oldest first, only entries with that site, in `unit`.
export function seriesFor(entries: BodyMeasurement[], site: MeasurementSite, unit: HeightUnit) {
  return [...entries]
    .filter((e) => e[site] !== null)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .map((e) => ({ recordedAt: e.recorded_at, value: roundLength(convertLength(Number(e[site]), e.unit, unit)) }))
}

export interface SiteSummary {
  site: MeasurementSite
  latest: number
  // Latest minus the first entry with this site; null with one entry.
  change: number | null
  count: number
}

export function siteSummaries(entries: BodyMeasurement[], unit: HeightUnit): SiteSummary[] {
  const out: SiteSummary[] = []
  for (const site of MEASUREMENT_SITES) {
    const series = seriesFor(entries, site, unit)
    if (series.length === 0) continue
    const latest = series[series.length - 1].value
    out.push({ site, latest, change: series.length > 1 ? roundLength(latest - series[0].value) : null, count: series.length })
  }
  return out
}

// "Waist 32 · Chest 40.5 in" for a history row.
export function entrySummary(entry: BodyMeasurement): string {
  const parts = MEASUREMENT_SITES.filter((site) => entry[site] !== null).map((site) => `${SITE_LABELS[site]} ${Number(entry[site])}`)
  return `${parts.join(' · ')} ${entry.unit}`
}

// A picked YYYY-MM-DD at the time of day of `keepTimeOf` (an edit keeps its
// original time) or now, in local time, so it never lands on the day before.
export function dateInputToIso(value: string, keepTimeOf?: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = keepTimeOf ? new Date(keepTimeOf) : new Date()
  date.setFullYear(year, month - 1, day)
  return date.toISOString()
}

export function toDateInputValue(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
