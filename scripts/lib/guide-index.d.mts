// Types for guide-index.mjs (issue #568), shared with the app's
// src/lib/guideSearch.ts through the `virtual:guide-index` module.
export interface GuideRun {
  text: string
  strong?: true
}

export interface GuideBlock {
  runs: GuideRun[]
  bullet?: true
}

export interface GuideStep {
  heading: string
  blocks: GuideBlock[]
}

export interface GuideEntry {
  slug: string
  topic: string
  title: string
  summary: string
  lede: GuideRun[]
  steps: GuideStep[]
}

export function plainText(html: string): string
export function inlineRuns(html: string): GuideRun[]
export function parseGuidesIndex(html: string): { slug: string; topic: string; summary: string }[]
export function parseGuidePage(html: string): { title: string; lede: GuideRun[]; steps: GuideStep[] }
export function buildGuideIndex(siteDir?: string): GuideEntry[]
