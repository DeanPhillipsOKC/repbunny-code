// Issue #950: what RepBunny could send upstream to free-exercise-db.
// Lists, for every source exercise RepBunny matched or imported, the other names
// people type for it (RepBunny's name plus its aliases, minus the source's own).
// Names only: never RepBunny's rewritten how-to text or its load types.
//   node scripts/exercise-import/upstream-proposal.mjs <free-exercise-db/dist/exercises.json> [--md]
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { MATCHES, PICKS } from './curation.mjs'

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function buildProposal(source, lib) {
  const sourceById = new Map(source.map((e) => [e.id, e]))
  const libById = new Map(lib.map((e) => [e.id, e]))
  const libByName = new Map(lib.map((e) => [e.name, e]))
  const rows = []
  const add = (sourceId, entry) => {
    const src = sourceById.get(sourceId)
    if (!src || !entry) return
    const seen = new Set([norm(src.name)])
    const aliases = []
    for (const a of [entry.name, ...(entry.aliases ?? [])]) {
      if (!seen.has(norm(a))) { seen.add(norm(a)); aliases.push(a) }
    }
    if (aliases.length) rows.push({ id: sourceId, name: src.name, aliases })
  }
  for (const [sourceId, m] of Object.entries(MATCHES)) add(sourceId, libById.get(m.id))
  for (const pick of PICKS) add(pick[0], libByName.get(pick[1]))
  return rows
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]
  if (!file) { console.error('usage: upstream-proposal.mjs <exercises.json> [--md]'); process.exit(1) }
  const source = JSON.parse(readFileSync(file, 'utf8'))
  const lib = JSON.parse(readFileSync(new URL('../../src/data/exercise-library.json', import.meta.url), 'utf8'))
  const rows = buildProposal(source, lib)
  if (process.argv.includes('--md')) {
    for (const r of rows) console.log(`- ${r.name} (\`${r.id}\`): ${r.aliases.join(', ')}`)
  } else console.log(JSON.stringify(rows, null, 2))
}
