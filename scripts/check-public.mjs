// Public-content check (#942). The code goes public as a snapshot of this repo (#937), so nothing
// private may sit in its files, commits, or PR text. The rule is docs/public-content.md; this
// script is its mechanical half. It fails on:
//
//   - email addresses other than hello@repbunny.app, bot and noreply addresses, and the
//     example domains (example.com/.org/.net, .test, .invalid)
//   - the testers' and pilot users' names
//   - Gmail thread links (a real support conversation)
//   - pasted email headers and quote lines (support email content)
//   - the retired pilot host and tokens with a known prefix
//
// The private words and hosts are stored as SHA-256 digests, never spelled out, so this file can be
// scanned like any other and ships with the public snapshot. To add one:
//   node -e "console.log(require('crypto').createHash('sha256').update('word').digest('hex'))"
// (lowercase, a bare word or a full hostname).
//
// Reviewed exceptions live in scripts/public-allowlist.json: { path, rule, reason }, where path
// is a tracked file (or a folder ending in /) and rule is one of the rule ids below.
//
// Usage:
//   node scripts/check-public.mjs              every tracked file (npm run check:public, CI)
//   node scripts/check-public.mjs <file>...    just those files
//   node scripts/check-public.mjs --stdin      text on stdin, such as a PR body or commit message
//                                              (the allowlist doesn't apply)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const ALLOWLIST_FILE = 'scripts/public-allowlist.json'

// Addresses that may appear: the public support address, bots, and documentation domains.
const ALLOWED_EMAIL = [
  /^hello@repbunny\.app$/i,
  /^[^@]*noreply[^@]*@/i,
  /@users\.noreply\.github\.com$/i,
  /\[bot\]@/i,
  /@example\.(com|org|net)$/i,
  /\.(test|invalid|example|localhost)$/i,
  /^git@github\.com$/i,
]
const EMAIL = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
// `AppIcon-512@2x.png` and similar asset names aren't addresses.
const NOT_EMAIL = /@\d+x\.|\.(png|jpe?g|webp|svg|gif)$/i

const sha256 = (s) => createHash('sha256').update(s.toLowerCase()).digest('hex')

// Digests of lowercased words: the tester's name (three spellings, one of them how speech-to-text
// writes it) and the local part of their personal address.
const PRIVATE_WORDS = new Set([
  'ceaa9749b0471a8bcd157a4b16ad02dbc319a0422d4900245d3ae368bb72e75e',
  '05370c7b1258b44e114a3f0ba60c4af308f3b3dd877635a42ff48e8a357f3d5f',
  '9fcbf0ff4064995169361c8b9fd24b80dfa9f2e66fa699fd53704c694b6afbcc',
  'ea6fba8b7fba7f9bf059e1a2d4964cae37e9b21421af4e87024c8f750cc5ea5d',
])
// Digests of lowercased hostnames; a subdomain of one matches too.
const PRIVATE_HOSTS = new Set([
  '0105cbf5b23bf15353f5078a0f62bc4a13661fc65a8919c0ccc95649ac276743',
])
const HOST = /[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/g

export const RULES = [
  {
    id: 'email',
    what: 'a personal email address',
    find(line) {
      return (line.match(EMAIL) ?? [])
        .map((m) => m.replace('%40', '@'))
        .filter((m) => !NOT_EMAIL.test(m) && !ALLOWED_EMAIL.some((re) => re.test(m)))
    },
  },
  {
    id: 'tester-name',
    what: "a tester's or pilot user's name (write \"the iPhone tester\")",
    find: (line) => (line.match(/[A-Za-z0-9]+/g) ?? []).filter((w) => PRIVATE_WORDS.has(sha256(w))),
  },
  {
    id: 'gmail-link',
    what: 'a Gmail thread link',
    re: /mail\.google\.com\/mail\/[^\s`'")\]]*#[a-z-]+\/[A-Za-z0-9_:-]{10,}/gi,
  },
  {
    id: 'support-content',
    what: 'pasted email content (headers or a quote line)',
    re: /^\s*>?\s*(?:From|Reply-To|To|Cc|Sent|Subject):\s.*<[^>\s]+@[^>\s]+>|-{5}Original Message-{5}|^\s*>?\s*On .{6,80}<[^>\s]+@[^>\s]+> wrote:\s*$/gim,
  },
  {
    id: 'private-host',
    what: 'a private or retired hostname',
    find(line) {
      const out = (line.match(/\b[a-z0-9]{20}\.supabase\.co\b/gi) ?? [])
      for (const host of line.match(HOST) ?? []) {
        const parts = host.split('.')
        for (let i = 0; i < parts.length - 1; i++) {
          if (PRIVATE_HOSTS.has(sha256(parts.slice(i).join('.')))) {
            out.push(host)
            break
          }
        }
      }
      return out
    },
  },
  {
    id: 'token',
    what: 'something shaped like a token',
    re: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|gh[osu]_[A-Za-z0-9]{30,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|xox[bpas]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b/g,
  },
]

function findInLine(rule, line) {
  if (rule.find) return rule.find(line)
  return [...line.matchAll(rule.re)].map((m) => m[0])
}

// Every finding in one text: [{ line, rule, match }].
export function scanText(text) {
  const out = []
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of RULES) {
      for (const match of findInLine(rule, line)) out.push({ line: i + 1, rule: rule.id, match })
    }
  })
  return out
}

function loadAllowlist() {
  const list = JSON.parse(readFileSync(ALLOWLIST_FILE, 'utf8'))
  const ids = new Set(RULES.map((r) => r.id))
  for (const e of list) {
    if (!e.path || !ids.has(e.rule) || !e.reason) {
      throw new Error(`${ALLOWLIST_FILE}: every entry needs a path, a known rule, and a reason: ${JSON.stringify(e)}`)
    }
  }
  return list
}

const allowed = (list, path, rule) =>
  list.some((e) => e.rule === rule && (e.path === path || (e.path.endsWith('/') && path.startsWith(e.path))))

function report(findings) {
  const what = Object.fromEntries(RULES.map((r) => [r.id, r.what]))
  for (const f of findings) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.match}  (${what[f.rule]})`)
  if (findings.length) {
    console.log(`\n${findings.length} finding(s). Reword them (docs/public-content.md), or add a reviewed`)
    console.log(`exception with a reason to ${ALLOWLIST_FILE}.`)
  }
}

function main(argv) {
  if (argv.includes('--stdin')) {
    const findings = scanText(readFileSync(0, 'utf8')).map((f) => ({ file: '<stdin>', ...f }))
    report(findings)
    return findings.length ? 1 : 0
  }
  const files = argv.length
    ? argv
    : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  const list = loadAllowlist()
  const findings = []
  for (const file of files) {
    if (file === ALLOWLIST_FILE) continue // paths of public site files, which the allowlist reviews
    // File names count too (an image named after someone).
    for (const f of scanText(file)) if (!allowed(list, file, f.rule)) findings.push({ ...f, file, line: 0 })
    let buf
    try {
      buf = readFileSync(file)
    } catch {
      continue // deleted in the working tree
    }
    if (buf.includes(0)) continue // binary
    for (const f of scanText(buf.toString('utf8'))) if (!allowed(list, file, f.rule)) findings.push({ file, ...f })
  }
  report(findings)
  if (!findings.length) console.log(`check:public: ${files.length} file(s) clean.`)
  return findings.length ? 1 : 0
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  process.exit(main(process.argv.slice(2)))
}
