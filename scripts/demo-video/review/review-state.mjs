// Sprint review, replies (#607, #664): what the owner said and what was done about it, kept in the
// review issue's own body so it survives between runs. No I/O here; review-issue.mjs builds the
// issue and review-reply.mjs acts on the owner's lines.
//
// The body carries `<!-- sprint-review-actions: {"535":{"v":"accepted","said":"good"},
// "536":{"v":"change","said":"make the button bigger","f":601}} -->`. `v` is accepted, change,
// pulled, or asked (a question is out and the owner hasn't answered); `f` is the follow-up issue.

const ACTIONS = /<!-- sprint-review-actions: (\{.*?\}) -->/
const LINE = /^\s*[-*]?\s*`?#(\d+)\s*:?\s*(.+?)`?\s*$/

// The owner's last line per issue from comment bodies: Map(issue -> text).
export function sayings(bodies) {
  const out = new Map()
  for (const body of bodies) {
    for (const line of body.split('\n')) {
      const m = line.match(LINE)
      if (m) out.set(Number(m[1]), m[2].trim())
    }
  }
  return out
}

// 'accepted', 'pulled', or 'change' for one line. Anything else is 'change': a reviewer's skill
// decides whether it is clear enough to act on.
export function classify(said) {
  if (/\bpull\b|\brevert\b/i.test(said)) return 'pulled'
  if (/^(good|great|ok|okay|accept(ed)?|ship( it)?|lgtm|yes|looks good|approved?)\b/i.test(said)) return 'accepted'
  return 'change'
}

export function readActions(body) {
  const m = body?.match(ACTIONS)
  return m ? JSON.parse(m[1]) : {}
}

export function writeActions(body, actions) {
  const mark = `<!-- sprint-review-actions: ${JSON.stringify(actions)} -->`
  return ACTIONS.test(body) ? body.replace(ACTIONS, () => mark) : `${body.trimEnd()}\n\n${mark}\n`
}

// The status sentence for the owner's verdicts so far. `isClosed(n)` says whether follow-up
// issue n has shipped.
export function summarize(issues, actions, isClosed) {
  const entries = issues.map((n) => [n, actions[n]])
  const ref = (a) => (isClosed(a.f) ? `#${a.f} shipped` : `#${a.f}`)
  const accepted = entries.filter(([, a]) => a?.v === 'accepted')
  const changed = entries.filter(([, a]) => a?.v === 'change' && a.f)
  const pulled = entries.filter(([, a]) => a?.v === 'pulled' && a.f)
  const waiting = entries.length - accepted.length - changed.length - pulled.length
  const parts = []
  if (accepted.length) parts.push(`${accepted.length} accepted`)
  if (changed.length) parts.push(`${changed.length} change${changed.length === 1 ? '' : 's'} requested (${changed.map(([, a]) => ref(a)).join(', ')})`)
  if (pulled.length) parts.push(`${pulled.length} pulled (${pulled.map(([, a]) => ref(a)).join(', ')})`)
  if (waiting) parts.push(`${waiting} not settled yet`)
  const open = [...changed, ...pulled].filter(([, a]) => !isClosed(a.f)).map(([, a]) => `#${a.f}`)
  let end = 'Ready to release.'
  if (waiting) end = 'Waiting on your review.'
  else if (open.length) end = `Release after ${open.length === 1 ? `${open[0]} ships` : `${open.slice(0, -1).join(', ')} and ${open.at(-1)} ship`}.`
  return `${parts.join(', ') || 'nothing settled yet'}. ${end}`
}

// Whether every change is settled: accepted, or its follow-up issue has shipped. A review that
// reaches this is closed by review-reply.mjs (#664).
export function ready(issues, actions, isClosed) {
  return issues.every((n) => {
    const a = actions[n]
    return a?.v === 'accepted' || ((a?.v === 'change' || a?.v === 'pulled') && a.f && isClosed(a.f))
  })
}

// "Looks good", or what a comment didn't mention (#664): an accepted entry for every change with
// no verdict yet. Changes with a question out keep waiting. Empty once nothing is left, so a
// second run changes nothing.
export function acceptRest(issues, actions, said) {
  return Object.fromEntries(issues.filter((n) => !actions[n]).map((n) => [n, { v: 'accepted', said }]))
}

// How many changes the owner hasn't reviewed yet: no verdict, or a question still out.
export function unreviewed(issues, actions) {
  return issues.filter((n) => !actions[n] || actions[n].v === 'asked').length
}

// What one change came to, for the body's read-only `## Outcome` list (#664).
export function outcome(action, isClosed) {
  if (!action) return 'waiting on your review'
  if (action.v === 'accepted') return 'accepted'
  if (action.v === 'asked') return 'question asked'
  const shipped = isClosed(action.f) ? ', shipped' : ''
  return action.v === 'pulled' ? `pulled as #${action.f}${shipped}` : `change filed as #${action.f}${shipped}`
}

const OUTCOME_END = /: (accepted|waiting on your review|question asked|(change filed|pulled) as #\d+(, shipped)?)$/

// One line of the Outcome list: `- #535 Title: accepted`. Also turns the old `## Verdicts`
// checklist (`- [x] #535 Title · accepted`) into the new form.
export function outcomeLine(line, action, isClosed) {
  const base = line.replace(/^- (\[[ x]\] )?/, '- ').split(' · ')[0].replace(OUTCOME_END, '')
  return `${base}: ${outcome(action, isClosed)}`
}

// The comments already acted on, kept in the body: `<!-- sprint-review-read: {"<id>":"read"} -->`,
// where "held" means a question about that comment is still out, so nothing else in it has been
// accepted yet.
const READ = /<!-- sprint-review-read: (\{.*?\}) -->/

export function readSeen(body) {
  const m = body?.match(READ)
  return m ? JSON.parse(m[1]) : {}
}

export function writeSeen(body, seen) {
  const mark = `<!-- sprint-review-read: ${JSON.stringify(seen)} -->`
  return READ.test(body) ? body.replace(READ, () => mark) : `${body.trimEnd()}\n${mark}\n`
}

// The whole body with its status line, Outcome list, and marker brought up to date.
export function refreshBody(body, version, isClosed) {
  const mark = body.match(/<!-- sprint-review: (\{.*?\}) -->/)
  const issues = mark ? JSON.parse(mark[1]).issues : []
  const actions = readActions(body)
  let section = ''
  const lines = body.split('\n').map((line) => {
    if (line.startsWith('## ')) {
      section = line
      return line === '## Verdicts' ? '## Outcome' : line
    }
    if (line.startsWith('**Status:**')) {
      const head = line.match(/^\*\*Status:\*\* v[^ ]+ candidate( \([a-z]+\))?/)?.[0] ?? `**Status:** v${version} candidate`
      return `${head}: ${summarize(issues, actions, isClosed)}`
    }
    if (section !== '## Outcome' && section !== '## Verdicts') return line
    const m = line.match(/^- (\[[ x]\] )?#(\d+)\b/)
    return m ? outcomeLine(line, actions[m[2]], isClosed) : line
  })
  return lines.join('\n')
}

// The line /release shows (`review-issue.mjs --status`): `Sprint review: <link> (<state>)`.
// `review` is { url, state }; a closed review never reads as waiting on the owner (#664).
export function statusText(review, issues, actions, isClosed) {
  const head = `Sprint review: ${review.url}`
  if (review.state !== 'closed') return `${head} (${summarize(issues, actions, isClosed)})`
  if (ready(issues, actions, isClosed)) return `${head} (closed, ready to release)`
  const left = unreviewed(issues, actions)
  if (left) return `${head} (closed by you, ${left} not reviewed)`
  return `${head} (closed; ${summarize(issues, actions, isClosed)})`
}
