// Totals what the current Claude Code session has cost so far, from its own transcript, so a
// next-item close-out can record cost per change and process-review can compare it across
// effort scores and guideline changes.
//
//   node scripts/run-cost.mjs                    # this session (Claude Code sets CLAUDE_CODE_SESSION_ID)
//   node scripts/run-cost.mjs --session <uuid>   # a past session
//   node scripts/run-cost.mjs --agent <id>       # one subagent of this (or --session's) session only
//   node scripts/run-cost.mjs --json             # machine-readable totals
//
// Transcripts live at ~/.claude/projects/<project>/<session>.jsonl (or under CLAUDE_CONFIG_DIR).
// Subagent transcripts (<session>/subagents/*.jsonl) are added in.
//
// Usage lines repeat once per content block of the same API response, so they are deduped by
// request id. Subagent transcripts record output tokens as of the start of each response, so
// --agent undercounts output (input counts are exact; found in #628). Cost is the API-equivalent price at list rates (cache writes 1.25x for 5 minutes,
// 2x for 1 hour). Plan sessions aren't billed per token, so treat it as a comparable unit, not a
// bill. Prints one markdown line for the close-out, then an HTML comment with the JSON so
// process-review can parse it back out of issue comments.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename } from 'node:path'

// $ per million tokens: [input, output, cache read]. Cache writes derive from input.
const PRICES = {
  'claude-fable-5-1': [10, 50, 0.25],
  'claude-fable-5': [10, 50, 1],
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-opus-5': [5, 25, 0.5],
  'claude-sonnet-5-5': [2, 10, 0.2],
  'claude-sonnet-5': [2, 10, 0.2],
  'claude-haiku-5-5': [0.1, 0.5, 0.01],
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

const sessionArg = arg('session') || process.env.CLAUDE_CODE_SESSION_ID
const asJson = process.argv.includes('--json')
if (!sessionArg) {
  console.error('Not in a Claude Code session; pass --session <id>.')
  process.exit(2)
}

const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const projectsDir = join(configDir, 'projects')
if (!existsSync(projectsDir)) {
  console.error(`No transcripts at ${projectsDir}.`)
  process.exit(2)
}

const mainFile = readdirSync(projectsDir)
  .map((project) => join(projectsDir, project, `${sessionArg}.jsonl`))
  .find((file) => existsSync(file))
if (!mainFile) {
  console.error(`No transcript for session ${sessionArg}. Cost not recorded.`)
  process.exit(1)
}

const sessionId = basename(mainFile, '.jsonl')
const agentArg = arg('agent')
const subDir = join(mainFile.replace(/\.jsonl$/, ''), 'subagents')
let files = [mainFile]
if (agentArg) {
  files = [join(subDir, `agent-${agentArg}.jsonl`)]
  if (!existsSync(files[0])) {
    console.error(`No transcript for subagent ${agentArg} in session ${sessionId}.`)
    process.exit(1)
  }
} else if (existsSync(subDir)) {
  for (const name of readdirSync(subDir)) if (name.endsWith('.jsonl')) files.push(join(subDir, name))
}

const seen = new Set()
const byModel = {}
let first = Infinity
let last = 0
for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('"usage"')) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const msg = row.message
    const u = msg?.usage
    if (!u || row.type !== 'assistant') continue
    const key = row.requestId || msg.id
    if (seen.has(key)) continue
    seen.add(key)
    const t = Date.parse(row.timestamp)
    if (t) {
      first = Math.min(first, t)
      last = Math.max(last, t)
    }
    const m = (byModel[msg.model] ??= { turns: 0, input: 0, write5m: 0, write1h: 0, read: 0, output: 0 })
    m.turns++
    m.input += u.input_tokens || 0
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens || 0
    m.write1h += w1h
    m.write5m += (u.cache_creation_input_tokens || 0) - w1h
    m.read += u.cache_read_input_tokens || 0
    m.output += u.output_tokens || 0
  }
}

const totals = { turns: 0, input: 0, write5m: 0, write1h: 0, read: 0, output: 0, usd: 0, unpriced: [] }
for (const [model, m] of Object.entries(byModel)) {
  for (const k of ['turns', 'input', 'write5m', 'write1h', 'read', 'output']) totals[k] += m[k]
  const p = PRICES[model]
  if (!p) {
    totals.unpriced.push(model)
    continue
  }
  const [inp, out, rd] = p
  m.usd = (m.input * inp + m.write5m * inp * 1.25 + m.write1h * inp * 2 + m.read * rd + m.output * out) / 1e6
  totals.usd += m.usd
}
const inTotal = totals.input + totals.write5m + totals.write1h + totals.read
const minutes = last > first ? Math.round((last - first) / 60000) : 0
const result = {
  session: sessionId,
  subagents: files.length - 1,
  minutes,
  turns: totals.turns,
  inputTokens: inTotal,
  cachedShare: inTotal ? +(totals.read / inTotal).toFixed(3) : 0,
  outputTokens: totals.output,
  usd: +totals.usd.toFixed(2),
  models: byModel,
  unpriced: totals.unpriced,
}

if (asJson) {
  console.log(JSON.stringify(result, null, 2))
} else {
  const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1e3)}k`)
  const models = Object.keys(byModel).join(', ')
  const sub = result.subagents ? `, ${result.subagents} subagent${result.subagents > 1 ? 's' : ''}` : ''
  const note = totals.unpriced.length ? ` (no price for ${totals.unpriced.join(', ')})` : ''
  console.log(
    `Cost: ~$${result.usd.toFixed(2)} API-equivalent${note}; ${k(inTotal)} input tokens ` +
      `(${Math.round(result.cachedShare * 100)}% cache reads), ${k(totals.output)} output, ` +
      `${result.turns} turns, ${minutes} min (${models}${sub})`,
  )
  const { models: _m, ...compact } = result
  console.log(`<!-- run-cost: ${JSON.stringify(compact)} -->`)
}
