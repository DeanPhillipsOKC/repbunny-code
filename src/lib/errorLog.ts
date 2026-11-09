import { ref, type App } from 'vue'
import type { ClientErrorEntry, ClientErrorKind, ClientErrorsRepo, DataError, Repos } from '../data/types'
import { actionTrail } from './actionTrail'

// Issue #83: the client error log. Vue and window errors, unhandled
// rejections, and failed data writes land in `client_errors` (on-device
// SQLite) so a failure can be looked at after it's gone from the screen. Logging never throws, never blocks the UI,
// and never logs its own failures. docs/architecture.md "Client error log".

export interface ClientErrorInput {
  kind: ClientErrorKind
  message: string
  stack?: string | null
  context?: Record<string, unknown> | null
  // Issue #234: false for a failure the app already explains on screen
  // (offline, say), so it doesn't also offer a bug report.
  prompt?: boolean
}

// Drops a message seen more than `limit` times in the last `windowMs`, so a
// render loop or a retry storm can't flood the table.
export function createThrottle(limit = 5, windowMs = 60_000, now: () => number = Date.now) {
  const seen = new Map<string, number[]>()
  return (key: string): boolean => {
    const t = now()
    const recent = (seen.get(key) ?? []).filter((at) => t - at < windowMs)
    if (recent.length >= limit) {
      seen.set(key, recent)
      return false
    }
    recent.push(t)
    seen.set(key, recent)
    return true
  }
}

// Entries that couldn't be written (offline is common at the gym) wait here
// and go out on the next start or `online` event. The `repbunny-` prefix
// means Erase all data clears it too.
export const QUEUE_KEY = 'repbunny-client-error-queue'
const QUEUE_LIMIT = 50

let sink: ClientErrorsRepo | null = null
const allow = createThrottle()

export function setErrorSink(repo: ClientErrorsRepo) {
  sink = repo
}

// Issue #234: the error the "Send a report?" prompt is offering, with its
// action trail. App.vue shows ReportPrompt.vue while it's set. Each kind +
// message is offered at most once per session.
export type PromptedError = ClientErrorEntry & { id: string }
export const reportPrompt = ref<PromptedError | null>(null)
const offered = new Set<string>()

// Noise the browser raises that isn't a RepBunny bug.
const BENIGN = /ResizeObserver loop|^Script error\.?$/i

function offerReport(input: ClientErrorInput, entry: ClientErrorEntry) {
  if (input.prompt === false || BENIGN.test(input.message)) return
  const key = `${input.kind}:${input.message}`
  if (offered.has(key)) return
  offered.add(key)
  reportPrompt.value = {
    ...entry,
    id: `prompt-${entry.occurred_at}`,
    context: { ...(input.context ?? {}), trail: actionTrail() },
  }
}

// e2e/report-prompt-unit.spec.ts starts each case fresh.
export function resetReportPrompt() {
  offered.clear()
  reportPrompt.value = null
}

function readQueue(): ClientErrorEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as ClientErrorEntry[]) : []
  } catch {
    return []
  }
}

function writeQueue(entries: ClientErrorEntry[]) {
  try {
    if (entries.length === 0) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(-QUEUE_LIMIT)))
  } catch {
    // Storage full or blocked: drop it rather than log about logging.
  }
}

// Issue #84: the Report a bug sheet lists entries still waiting to go out
// alongside the stored ones, and its "Clear log" empties both.
export function queuedClientErrors(): ClientErrorEntry[] {
  return readQueue()
}

export function clearClientErrorQueue() {
  writeQueue([])
}

async function send(entry: ClientErrorEntry): Promise<boolean> {
  if (!sink) return false
  try {
    const { error } = await sink.insert(entry)
    return !error
  } catch {
    return false
  }
}

function currentRoute(): string | null {
  try {
    return location.pathname + location.search
  } catch {
    return null
  }
}

function buildEntry(input: ClientErrorInput): ClientErrorEntry {
  return {
    occurred_at: new Date().toISOString(),
    kind: input.kind,
    message: input.message.slice(0, 2000),
    stack: input.stack?.slice(0, 8000) ?? null,
    route: currentRoute(),
    // Issue #234: the log stays on the device, so each entry keeps the trail.
    context: { ...(input.context ?? {}), trail: actionTrail() },
    app_version: typeof __APP_VERSION__ === 'undefined' ? null : __APP_VERSION__,
    user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
  }
}

export function logClientError(input: ClientErrorInput): void {
  try {
    if (!allow(`${input.kind}:${input.message}`)) return
    const entry = buildEntry(input)
    offerReport(input, entry)
    void send(entry).then((sent) => {
      if (!sent) writeQueue([...readQueue(), entry])
    })
  } catch {
    // Never let logging break the caller.
  }
}

let flushing = false

export async function flushClientErrorQueue(): Promise<void> {
  if (flushing) return
  const queued = readQueue()
  if (queued.length === 0) return
  flushing = true
  try {
    writeQueue([])
    const failed: ClientErrorEntry[] = []
    for (const entry of queued) {
      if (!(await send(entry))) failed.push(entry)
    }
    if (failed.length) writeQueue([...failed, ...readQueue()])
  } finally {
    flushing = false
  }
}

function describe(value: unknown): { message: string; stack: string | null } {
  if (value instanceof Error) return { message: value.message || value.name, stack: value.stack ?? null }
  if (typeof value === 'object' && value !== null && 'message' in value) {
    return { message: String((value as { message: unknown }).message), stack: null }
  }
  return { message: String(value), stack: null }
}

// Vue render/lifecycle errors, plus anything thrown or rejected outside Vue.
export function installErrorHandlers(app: App) {
  app.config.errorHandler = (err, _instance, info) => {
    // Setting a handler stops Vue printing the error, so keep it visible.
    console.error(err)
    logClientError({ kind: 'error', ...describe(err), context: { vue: info } })
  }
  window.addEventListener('error', (event) => {
    const { message, stack } = describe(event.error ?? event.message)
    logClientError({ kind: 'error', message, stack, context: event.filename ? { source: `${event.filename}:${event.lineno}:${event.colno}` } : null })
  })
  window.addEventListener('unhandledrejection', (event) => {
    logClientError({ kind: 'rejection', ...describe(event.reason) })
  })
  window.addEventListener('online', () => void flushClientErrorQueue())
  void flushClientErrorQueue()
}

// The repos whose writes get logged, and the table each one's writes go to
// by default. Methods with "Set", "Workout", or "Exercise" in a repo that
// writes several tables name their own (see tableFor).
const LOGGED_REPOS: Partial<Record<keyof Repos, string>> = {
  workouts: 'workouts',
  exercises: 'exercises',
  templates: 'workout_templates',
  bodyWeight: 'body_weight_entries',
  measurements: 'body_measurements',
  profile: 'profiles',
}

const WRITE_METHOD = /^(create|update|insert|delete|remove|add|save)/

function tableFor(repo: keyof Repos, method: string, fallback: string): string {
  if (repo === 'workouts' && /Set/.test(method)) return 'sets'
  if (repo === 'templates' && /Exercise/.test(method)) return 'workout_template_exercises'
  return fallback
}

// Ids only: string arguments, and the id fields of an object argument. Never
// the reps, weights, names, or notes the user typed.
const ID_FIELDS = ['id', 'workout_id', 'exercise_id', 'template_id']

function idsFrom(args: unknown[]): Record<string, unknown> {
  const ids: Record<string, unknown> = {}
  args.forEach((arg, index) => {
    if (typeof arg === 'string' && /^[0-9a-f-]{36}$/i.test(arg)) ids[`arg${index}`] = arg
    else if (Array.isArray(arg)) {
      const first = arg[0] as Record<string, unknown> | undefined
      ids[`arg${index}_rows`] = arg.length
      if (first && typeof first === 'object') {
        for (const field of ID_FIELDS) if (typeof first[field] === 'string') ids[field] = first[field]
      }
    } else if (arg && typeof arg === 'object') {
      for (const field of ID_FIELDS) {
        const value = (arg as Record<string, unknown>)[field]
        if (typeof value === 'string') ids[field] = value
      }
    }
  })
  return ids
}

function isNetworkFailure(message: string): boolean {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  return offline || /failed to fetch|networkerror|load failed|network request failed/i.test(message)
}

function logRequestFailure(repo: keyof Repos, method: string, args: unknown[], error: DataError | unknown) {
  const { message, stack } = describe(error)
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as DataError).code : undefined
  logClientError({
    kind: 'request',
    message,
    stack,
    // Offline at the gym is expected and the app says so; no report offer.
    prompt: !isNetworkFailure(message),
    context: { operation: `${repo}.${method}`, table: tableFor(repo, method, LOGGED_REPOS[repo]!), ...(code ? { code } : {}), ...idsFrom(args) },
  })
}

// Wraps every write in LOGGED_REPOS so a returned `{ error }` or a throw is
// logged on its way back to the store, which still sees exactly what it did
// before. clientErrors itself is never wrapped, so logging can't loop.
export function withRequestLogging(repos: Repos): Repos {
  const wrapped = { ...repos }
  for (const repo of Object.keys(LOGGED_REPOS) as (keyof Repos)[]) {
    const original = repos[repo] as unknown as Record<string, unknown>
    const copy: Record<string, unknown> = { ...original }
    for (const [method, fn] of Object.entries(original)) {
      if (typeof fn !== 'function' || !WRITE_METHOD.test(method)) continue
      copy[method] = async (...args: unknown[]) => {
        try {
          const result = await (fn as (...a: unknown[]) => Promise<unknown>).apply(original, args)
          const error = (result as { error?: DataError | null } | null)?.error
          if (error) logRequestFailure(repo, method, args, error)
          return result
        } catch (e) {
          logRequestFailure(repo, method, args, e)
          throw e
        }
      }
    }
    ;(wrapped as unknown as Record<string, unknown>)[repo] = copy
  }
  return wrapped
}
