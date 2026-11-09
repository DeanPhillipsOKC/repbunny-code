// Issue #679: mints a short-lived installation token for one of the repo's GitHub Apps, RepBunny
// Builder or RepBunny Reviewer (set up in #674), so a workflow acts as that bot instead of the owner.
// Runs inside GitHub Actions only (.github/workflows/open-pr.yml and post-review.yml): cloud
// sessions' proxy swaps any GitHub token for the session's own credentials, so an app token sent
// from a session changes nothing. Sessions start those workflows with scripts/bot-dispatch.mjs.
//
//   node scripts/gh-app-token.mjs --app builder|reviewer          # prints a token (lives an hour)
//   node scripts/gh-app-token.mjs --app builder|reviewer --check  # mints one, prints who it is, never the token
//   ... --repo <owner>/<repo>   # the installation on another repo, such as the backlog repo (#944)
//
// Reads <APP>_APP_ID and <APP>_APP_KEY. The key may be the raw PEM or its base64 (the cloud
// environment only takes one-line values), so both work.
import { createSign } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { CODE_REPO } from './code-repo.mjs'

// The code repo this runs in (#946); --repo picks another installation.
const REPO = CODE_REPO
const API = 'https://api.github.com'
export const APPS = ['builder', 'reviewer']

export function decodeKey(value) {
  const text = value.trim()
  return text.startsWith('-----BEGIN') ? text : Buffer.from(text, 'base64').toString('utf8')
}

function appConfig(app, env = process.env) {
  const prefix = app.toUpperCase()
  const id = env[`${prefix}_APP_ID`]
  const key = env[`${prefix}_APP_KEY`]
  if (!id || !key) throw new Error(`${prefix}_APP_ID and ${prefix}_APP_KEY must both be set`)
  return { id, key: decodeKey(key) }
}

const b64url = (data) => Buffer.from(data).toString('base64url')

// GitHub's app JWT: RS256, issued a minute in the past for clock drift, valid under 10 minutes.
export function appJwt({ id, key }, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: String(id) }))
  const body = `${header}.${payload}`
  return `${body}.${createSign('RSA-SHA256').update(body).sign(key, 'base64url')}`
}

async function api(path, auth, method = 'GET') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

export async function mint(app, repo = REPO) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new Error(`--repo must be owner/repo, got "${repo}"`)
  const jwt = appJwt(appConfig(app))
  const installation = await api(`/repos/${repo}/installation`, jwt)
  const { token, expires_at: expiresAt } = await api(`/app/installations/${installation.id}/access_tokens`, jwt, 'POST')
  return { token, expiresAt, installationId: installation.id, slug: installation.app_slug }
}

async function main(argv) {
  const at = argv.indexOf('--app')
  const app = at === -1 ? null : argv[at + 1]
  if (!APPS.includes(app)) throw new Error(`--app must be one of ${APPS.join(', ')}`)
  const repoAt = argv.indexOf('--repo')
  const { token, expiresAt, installationId, slug } = await mint(app, repoAt === -1 ? REPO : argv[repoAt + 1])
  if (argv.includes('--check')) console.log(JSON.stringify({ app, slug, installationId, expiresAt }))
  else process.stdout.write(token)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`gh-app-token: ${error.message}`)
    process.exit(1)
  })
}
