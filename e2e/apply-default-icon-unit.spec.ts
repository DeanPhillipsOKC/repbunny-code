import { test, expect } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultIconImage } from '../src/lib/defaultAppIcon'

// Issue #857: Cut release's default_icon choice, applied by
// scripts/apply-default-icon.mjs to a copy of the native projects (same "no
// separate unit-test runner" reasoning as cut-release-unit.spec.ts).

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(repo, 'scripts/apply-default-icon.mjs')
const MANIFEST = 'android/app/src/main/AndroidManifest.xml'
const ANYDPI = 'android/app/src/main/res/mipmap-anydpi-v26'
const ASSETS = 'ios/App/App/Assets.xcassets'
const DEFAULT_PNG = `${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`

function copyProject() {
  const root = mkdtempSync(join(tmpdir(), 'default-icon-'))
  for (const path of [MANIFEST, DEFAULT_PNG]) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    copyFileSync(join(repo, path), join(root, path))
  }
  cpSync(join(repo, ANYDPI), join(root, ANYDPI), { recursive: true })
  cpSync(join(repo, `${ASSETS}/season-halloween.appiconset`), join(root, `${ASSETS}/season-halloween.appiconset`), { recursive: true })
  return root
}

const run = (root: string, ...args: string[]) =>
  spawnSync('node', [script, '--root', root, ...args], { cwd: root, encoding: 'utf8' })

test('a seasonal pick points the Classic launcher, the iPhone icon, and the picker at that season', () => {
  const root = copyProject()
  writeFileSync(join(root, '.env.production.local'), 'OTHER=1\nVITE_DEFAULT_APP_ICON=season-autumn\n')
  try {
    const result = run(root, 'season-halloween')
    expect(result.status, result.stderr).toBe(0)
    const manifest = readFileSync(join(root, MANIFEST), 'utf8')
    expect(manifest).not.toContain('android:icon="@mipmap/ic_launcher"')
    expect(manifest).not.toContain('android:roundIcon="@mipmap/ic_launcher_round"')
    // The application and the Classic alias join the Halloween alias.
    const count = (text: string, attr: string) => text.split(attr).length - 1
    const original = readFileSync(join(repo, MANIFEST), 'utf8')
    for (const attr of ['android:icon="@mipmap/ic_launcher_season_halloween"', 'android:roundIcon="@mipmap/ic_launcher_season_halloween_round"']) {
      expect(count(manifest, attr)).toBe(count(original, attr) + 2)
    }
    // The theme aliases keep their own icons.
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher_chalk"')
    expect(readFileSync(join(root, DEFAULT_PNG))).toEqual(
      readFileSync(join(repo, `${ASSETS}/season-halloween.appiconset/season-halloween-1024.png`)),
    )
    expect(readFileSync(join(root, '.env.production.local'), 'utf8')).toBe('OTHER=1\nVITE_DEFAULT_APP_ICON=season-halloween\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('classic changes no native file and clears an earlier pick', () => {
  const root = copyProject()
  writeFileSync(join(root, '.env.production.local'), 'VITE_DEFAULT_APP_ICON=season-halloween\n')
  try {
    const result = run(root, 'classic')
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(root, MANIFEST), 'utf8')).toBe(readFileSync(join(repo, MANIFEST), 'utf8'))
    expect(readFileSync(join(root, DEFAULT_PNG))).toEqual(readFileSync(join(repo, DEFAULT_PNG)))
    expect(readFileSync(join(root, '.env.production.local'), 'utf8')).toBe('')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unknown or missing icon fails the build', () => {
  const root = copyProject()
  try {
    expect(run(root, 'halloween').stderr).toContain('use classic or a season-* id')
    expect(run(root, 'season-easter').stderr).toContain('No season-easter icon')
    expect(run(root).status).toBe(1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("--tag reads the annotation's default_icon line; a lightweight tag means classic", () => {
  const root = copyProject()
  const origin = mkdtempSync(join(tmpdir(), 'default-icon-origin-'))
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' })
  try {
    git(origin, 'init', '--quiet')
    git(origin, 'commit', '--quiet', '--allow-empty', '-m', 'base')
    git(origin, 'tag', '-a', 'store/v1.2.0', '-m', 'RepBunny store/v1.2.0', '-m', 'default_icon: season-halloween')
    git(origin, 'tag', 'store/v1.2.1')
    git(root, 'init', '--quiet')
    git(root, 'remote', 'add', 'origin', origin)

    const light = run(root, '--tag', 'store/v1.2.1')
    expect(light.stdout).toContain('Default icon: classic')
    expect(run(root, '--tag', 'v1.0.300').stderr).toContain("isn't store/vMAJOR.MINOR.PATCH")

    const annotated = run(root, '--tag', 'store/v1.2.0')
    expect(annotated.status, annotated.stderr).toBe(0)
    expect(annotated.stdout).toContain('Default icon: season-halloween')
    expect(existsSync(join(root, '.env.production.local'))).toBe(true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(origin, { recursive: true, force: true })
  }
})

test("the picker's Default tile shows the build's default icon", () => {
  expect(defaultIconImage(undefined)).toBe('/app-icons/classic.png')
  expect(defaultIconImage('')).toBe('/app-icons/classic.png')
  expect(defaultIconImage('season-halloween')).toBe('/app-icons/season-halloween.webp')
})
