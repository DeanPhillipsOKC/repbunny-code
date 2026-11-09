import type { SqlDb } from './data/sqlite/db'

// Issue #960: the e2e suite's way into the running app. The `local` project
// runs on a production build (`vite build` with VITE_E2E_HOOKS=true, served by
// `vite preview`), where an in-page `import('/src/...')` doesn't resolve, so
// the specs ask for a module by its source path instead:
// `await window.__rbImport('/src/lib/premium.ts')`. Each loader is the app's
// own chunk, so the spec gets the same module instance the app uses.
//
// Only installed on the dev server and in an e2e hooks build
// (src/data/index.ts); every store and personal build drops it, and
// e2e/build/no-dev-rows-unit.spec.ts checks that. A spec that needs a module
// not listed here gets an error naming it: add it to the list.
const modules = import.meta.glob([
  '/src/data/index.ts',
  '/src/data/sqlite/repos.ts',
  '/src/stores/profile.ts',
  '/src/lib/accountSheet.ts',
  '/src/lib/appIcon.ts',
  '/src/lib/backup.ts',
  '/src/lib/backupFolder.ts',
  '/src/lib/bugReport.ts',
  '/src/lib/errorLog.ts',
  '/src/lib/exerciseLibrary.ts',
  '/src/lib/exerciseSwap.ts',
  '/src/lib/homeWidgets.ts',
  '/src/lib/importMatch.ts',
  '/src/lib/libraryLink.ts',
  '/src/lib/nativeViewport.ts',
  '/src/lib/plates.ts',
  '/src/lib/premium.ts',
  '/src/lib/premiumStore.ts',
  '/src/lib/recordCelebrations.ts',
  '/src/lib/releaseNotes.ts',
  '/src/lib/reportPdf.ts',
  '/src/lib/restAlert.ts',
  '/src/lib/restLive.ts',
  '/src/lib/restorePoints.ts',
  '/src/lib/starterPrograms.ts',
  '/src/lib/strengthLevels.ts',
  '/src/lib/theme.ts',
  '/src/lib/trialPass.ts',
])

export function installTestHooks(openLocalDb: () => Promise<SqlDb>) {
  const w = window as unknown as {
    __rbLocalDb?: () => Promise<SqlDb>
    __rbImport?: (path: string) => Promise<unknown>
  }
  w.__rbLocalDb = openLocalDb
  w.__rbImport = (path) => {
    const load = modules[path]
    if (!load) return Promise.reject(new Error(`__rbImport: ${path} isn't in src/testHooks.ts's list`))
    return load()
  }
}
