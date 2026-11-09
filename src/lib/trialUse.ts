import type { RouteLocationRaw } from 'vue-router'
import { openAccountSheet } from './accountSheet'
import { GUIDES_URL } from './whatsNew'
import type { TrialFeature } from './trialPass'

// Issue #489: once a trial pass starts, say where its feature lives. Areas
// with their own screen get a one-tap button; the ones inside a workout get a
// pointer. Each links its repbunny.app guide.
export interface TrialUse {
  where: string
  action?: { label: string; to: RouteLocationRaw | 'theme' }
  guide: { label: string; path: string }
}

export const TRIAL_USE: Record<TrialFeature, TrialUse> = {
  themes: {
    where: 'Pick a look on the Theme screen in Preferences.',
    action: { label: 'Pick a theme', to: 'theme' },
    guide: { label: 'How themes work', path: 'themes/' },
  },
  progress: {
    where: 'Open Lift progress in Progress, or tap any exercise for its charts.',
    action: { label: 'See lift progress', to: { name: 'lift-progress' } },
    guide: { label: 'How lift progress works', path: 'exercise-history/' },
  },
  reports: {
    where: 'Your monthly report is in Progress.',
    action: { label: 'Open your report', to: { name: 'progress-report' } },
    guide: { label: 'How reports work', path: 'progress-reports/' },
  },
  strength: {
    where: 'Strength levels is in Progress.',
    action: { label: 'See strength levels', to: { name: 'strength-levels' } },
    guide: { label: 'How strength levels work', path: 'strength-levels/' },
  },
  targets: {
    where: 'During a workout, each exercise shows a target for your next set.',
    guide: { label: 'How next-set targets work', path: 'next-set-targets/' },
  },
  plates: {
    where: 'During a workout, tap Plates on a barbell exercise.',
    guide: { label: 'How the plate calculator works', path: 'plate-calculator/' },
  },
  swap: {
    where: 'During a workout, tap the swap button next to an exercise name.',
    guide: { label: 'How swaps work', path: 'swap-exercises/' },
  },
}

export function trialGuideUrl(feature: TrialFeature): string {
  return GUIDES_URL + TRIAL_USE[feature].guide.path
}

// Opens the feature's screen. The caller closes its own sheet first.
export function goToTrialFeature(feature: TrialFeature, push: (to: RouteLocationRaw) => unknown) {
  const to = TRIAL_USE[feature].action?.to
  if (!to) return
  if (to === 'theme') openAccountSheet('theme')
  else push(to)
}
