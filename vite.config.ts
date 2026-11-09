import { createReadStream, readdirSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { getBuildVersion } from './scripts/lib/build-version.mjs'
import { buildGuideIndex } from './scripts/lib/guide-index.mjs'
import { loadReleaseNotes } from './scripts/lib/release-notes.mjs'

// Issue #76: local mode in a browser (VITE_DATA=local) runs SQLite through
// jeep-sqlite, which fetches /assets/sql-wasm.wasm. Served from sql.js by the
// dev server and `vite preview` (the e2e `local` project's server, #960) only:
// the native apps use the platform's SQLite, so the build doesn't ship it. The wasm has to match the
// sql.js glue jeep-sqlite 2.8.0 bundled (1.11.0), or it fails to link, so
// it comes from the pinned `sql.js-jeep` alias, not the tests' newer sql.js.
function serveSqlWasm(): Plugin {
  const wasm = createRequire(import.meta.url).resolve('sql.js-jeep/dist/sql-wasm.wasm')
  const serve = (_req: unknown, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/wasm')
    createReadStream(wasm).pipe(res)
  }
  return {
    name: 'serve-sql-wasm',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/assets/sql-wasm.wasm', serve)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/assets/sql-wasm.wasm', serve)
    },
  }
}

// Issue #568: the in-app guide search's index, read from site/guides/ on every
// dev start and build (scripts/lib/guide-index.mjs), so it can't go stale. A
// guide the parser can't read fails the build. Imported lazily by the search
// sheet, so it's its own chunk and the app's first load doesn't grow.
function guideIndex(): Plugin {
  const id = 'virtual:guide-index'
  const resolved = '\0' + id
  return {
    name: 'guide-index',
    resolveId(source) {
      return source === id ? resolved : null
    },
    load(loadedId) {
      if (loadedId !== resolved) return null
      for (const file of readdirSync('site/guides', { recursive: true, withFileTypes: true })) {
        if (file.isFile() && file.name.endsWith('.html')) this.addWatchFile(resolve(file.parentPath, file.name))
      }
      return `export default ${JSON.stringify(buildGuideIndex('site'))}`
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getBuildVersion()),
    // Issue #558: read once at startup, so a new release-notes/ file needs a dev server restart.
    __RELEASE_NOTES__: JSON.stringify(loadReleaseNotes())
  },
  plugins: [
    vue(),
    serveSqlWasm(),
    guideIndex()
  ]
})
