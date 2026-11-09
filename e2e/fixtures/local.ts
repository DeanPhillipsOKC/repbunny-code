import { test as base, expect, type Page } from '@playwright/test'
import { skipUnlockCelebrations } from './celebration'
import { localDb as sharedLocalDb } from '../../scripts/lib/local-db.mjs'

// Issue #415: most feature specs run in the `local` project (local mode: the
// app on its own SQLite database in the browser, like the native apps), which
// needs no accounts, no cleanup, and no network. Each test's browser context
// starts with an empty database.
//
// `localDb(page)` reads and writes that database with a small query builder
// (`db.from('exercises').insert({ name }).select('id').single()`). It runs in
// the page against the app's own
// connection (`window.__rbLocalDb`, src/testHooks.ts: the dev server and the
// e2e hooks build only), with
// the adapter's own column encoding (src/data/sqlite/repos.ts). What it maps:
// - `profiles` is the single `settings` row; filters on it are ignored.
// - `user_id` is dropped from inserts and filters (one user per device).
// - Inserted rows get an id, and the defaults Postgres would fill
//   (`performed_at`, `recorded_at`, `occurred_at`: now). A set's `set_index`
//   is always the next one in its workout, like the server-side trigger.
// - Selects take plain columns and one-level embeds of the row a foreign key
//   points at (`exercises(name)`, `workout_templates!inner(name)`).
// Anything else (reverse embeds, `.or()`, RPCs) throws, so a spec finds out.

// Issue #960: the `local` project runs on a production build, where an in-page
// `import('/src/...')` doesn't resolve. Specs load the app's modules with
// `window.__rbImport('/src/lib/premium.ts')` instead (src/testHooks.ts lists them).
declare global {
  interface Window {
    __rbImport(path: string): Promise<any>
  }
}

export interface LocalResult<T = any> {
  data: T
  error: { message: string; code?: string } | null
  count: number | null
}

// The builder's shape. The code is plain JS in scripts/lib/local-db.mjs (#940),
// so the capture scripts use the same shim.
export interface LocalQuery<T = any> extends PromiseLike<LocalResult<T>> {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): LocalQuery<T>
  eq(column: string, value: unknown): LocalQuery<T>
  neq(column: string, value: unknown): LocalQuery<T>
  in(column: string, values: unknown[]): LocalQuery<T>
  is(column: string, value: null | boolean): LocalQuery<T>
  gt(column: string, value: unknown): LocalQuery<T>
  gte(column: string, value: unknown): LocalQuery<T>
  lt(column: string, value: unknown): LocalQuery<T>
  lte(column: string, value: unknown): LocalQuery<T>
  like(column: string, value: string): LocalQuery<T>
  ilike(column: string, value: string): LocalQuery<T>
  match(values: Record<string, unknown>): LocalQuery<T>
  order(column: string, options?: { ascending?: boolean }): LocalQuery<T>
  limit(count: number): LocalQuery<T>
  single(): LocalQuery<T>
  maybeSingle(): LocalQuery<T>
}

export interface LocalTable {
  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): LocalQuery
  insert(values: Record<string, unknown> | Record<string, unknown>[]): LocalQuery
  upsert(values: Record<string, unknown> | Record<string, unknown>[]): LocalQuery
  update(values: Record<string, unknown>): LocalQuery
  delete(): LocalQuery
}

export interface LocalDb {
  from(table: string): LocalTable
}

export function localDb(page: Page): LocalDb {
  return sharedLocalDb(page) as LocalDb
}

// Opens the app on a fresh database with the usual test defaults (unit `lb`,
// no default rest timer, the muscle check dismissed), plus Premium unless
// `premium: false`. `beforeNavigate` seeds rows
// (through `localDb(page)`); the app then reloads so they're there at its
// first real mount. It gets, and this returns, the fixed local user id, so
// seeding code written for the admin client (`user_id: userId`) still reads.
const LOCAL_USER_ID = 'local'

export async function startLocal(
  page: Page,
  options?: {
    beforeNavigate?: (userId: string) => Promise<void>
    muscleCheck?: boolean
    weightUnit?: 'lb' | 'kg' | null
    // Issue #429: 'fresh' keeps the new-install default rest (2:00) instead
    // of clearing it.
    defaultRestSeconds?: number | null | 'fresh'
    premium?: boolean
    // Issue #429: let the one-time first-rest tip show.
    restTip?: boolean
  },
): Promise<string> {
  const premium = options?.premium ?? true
  await page.addInitScript(
    ([suppressMuscleCheck, premium, suppressRestTip]) => {
      if (suppressMuscleCheck) localStorage.setItem('rb-muscle-check-dismissed', '1')
      if (premium) localStorage.setItem('repbunny-premium-unlocked', 'true')
      if (suppressRestTip) localStorage.setItem('rb-rest-tip-seen', '1')
    },
    [!options?.muscleCheck, premium, !options?.restTip] as const,
  )
  await skipUnlockCelebrations(page)
  await page.goto('/')
  await page.waitForLoadState('load')
  await page.waitForFunction(() => '__rbLocalDb' in window)

  const db = localDb(page)
  const weightUnit = options?.weightUnit === undefined ? 'lb' : options.weightUnit
  const rest = options?.defaultRestSeconds
  const { error } = await db
    .from('profiles')
    .update({ weight_unit: weightUnit, ...(rest !== 'fresh' && { default_rest_seconds: rest ?? null }) })
  if (error) throw new Error(error.message)
  if (options?.beforeNavigate) await options.beforeNavigate(LOCAL_USER_ID)
  try {
    await page.reload()
  } catch (e) {
    // Another navigation (a cold dev server reloading the page after it
    // optimizes a dependency) can abort this one; that load reads the same
    // database, so wait for it instead.
    if (!String(e).includes('ERR_ABORTED')) throw e
    await page.waitForLoadState('load')
  }
  return LOCAL_USER_ID
}

// Specs keep their `E2E <thing> <stamp>` names; the database is thrown away
// with the browser context, so there's nothing to clean up. `db` is the shim
// above for this test's page.
let lastStamp = 0
export const test = base.extend<{ stamp: number; db: LocalDb }>({
  stamp: async ({}, use) => {
    lastStamp = Math.max(Date.now(), lastStamp + 1)
    await use(lastStamp)
  },
  db: async ({ page }, use) => {
    await use(localDb(page))
  },
})

export { expect }

// Seeds one exercise on this page's database.
export async function seedExercise(page: Page, name: string) {
  const { error } = await localDb(page).from('exercises').insert({ name })
  if (error) throw new Error(error.message)
}

// Issue #429: a first launch now rests 2:00 by default. Specs that drive a
// real first launch (no startLocal) but aren't about the rest timer call this
// right after answering the unit sheet, so no rest screen covers the workout.
// Goes through the app's own profile store, so no reload is needed.
export async function turnOffDefaultRest(page: Page) {
  await page.evaluate(async () => {
    const { useProfileStore } = await window.__rbImport('/src/stores/profile.ts')
    const { error } = await useProfileStore().updateDefaultRestSeconds(null)
    if (error) throw new Error(error.message)
  })
}
