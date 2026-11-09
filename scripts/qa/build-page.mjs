#!/usr/bin/env node
// Issue #211: builds the Android QA artifact page from scripts/qa/procedure.mjs
// and scripts/qa/page.html. For each area it records the recent commits that
// touched the area's paths (with their build numbers, `git rev-list --count`),
// so the page can mark test cases "Changed since last pass" without reading
// anything back. Publish the output with Claude's Artifact tool to the URL in
// docs/qa-procedure.md. See that doc.
//
//   node scripts/qa/build-page.mjs [--out <file>]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AREAS, JOURNEYS, RELEASE_CHECKS, STANDARD_UX, TAP_COUNTS, TEST_CASES } from './procedure.mjs'
import { fixtureManifest, journeyManifest } from './fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const out = outIndex >= 0 ? args[outIndex + 1] : join(tmpdir(), 'repbunny-qa', 'qa-procedure.html')

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
const buildOf = new Map()
const buildNumber = (hash) => {
  if (!buildOf.has(hash)) buildOf.set(hash, Number(git('rev-list', '--count', hash)))
  return buildOf.get(hash)
}

const CHANGES_PER_AREA = 12
const areas = AREAS.map((area) => {
  const changes = area.paths.length
    ? git('log', `-n${CHANGES_PER_AREA}`, '--format=%H%x09%s', '--', ...area.paths)
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, subject] = line.split('\t')
          return { build: buildNumber(hash), subject }
        })
    : []
  return { ...area, changes }
})

const data = {
  generatedAt: new Date().toISOString(),
  currentBuild: Number(git('rev-list', '--count', 'HEAD')),
  areas,
  testCases: TEST_CASES,
  journeys: JOURNEYS,
  releaseChecks: RELEASE_CHECKS,
  tapCounts: TAP_COUNTS,
  standardUx: STANDARD_UX,
  fixtures: fixtureManifest(TEST_CASES, AREAS),
  journeyFixtures: journeyManifest(JOURNEYS),
  driveRoot: 'My Drive/RepBunny QA/Test data',
}

const template = readFileSync(join(here, 'page.html'), 'utf8')
const marker = '/*__QA_DATA__*/null'
if (!template.includes(marker)) throw new Error(`page.html is missing ${marker}`)
// `</` can't appear inside the inline script.
const json = JSON.stringify(data).replace(/<\//g, '<\\/')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, template.replace(marker, () => json))
console.log(`Wrote ${out} (build ${data.currentBuild}, ${TEST_CASES.length} test cases)`)
