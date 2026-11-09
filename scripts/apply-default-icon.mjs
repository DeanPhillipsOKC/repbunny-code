// Ships a store build with a seasonal icon as the app's default icon (#857).
//   node scripts/apply-default-icon.mjs <id>          classic or a season-* id
//   node scripts/apply-default-icon.mjs --tag <tag>   the id a store/v* tag carries
// Cut release (.github/workflows/cut-release.yml) writes the owner's pick into
// the tag's annotation as a `default_icon: <id>` line, so every build of the tag
// (Release to Google Play and Codemagic's ios-testflight) reads the same value.
// A lightweight tag (pushed by hand, or from before #857) or no line means
// classic. Run it before `npm run build` and the native build:
// - Android: the Classic launcher alias and the application in
//   AndroidManifest.xml point at @mipmap/ic_launcher_<id> instead of
//   @mipmap/ic_launcher (the seasonal sets generate-seasonal-icons.mjs made).
// - iPhone: the season's 1024px PNG replaces AppIcon.appiconset's image.
// - Web bundle: VITE_DEFAULT_APP_ICON in .env.production.local, so the App icon
//   picker's Default tile (#861) shows the icon that Default now gives.
// classic changes nothing in the native projects. It edits tracked files, so it
// belongs in a CI checkout; locally, `git checkout android ios` undoes it.
// --root <dir> runs it on a copy (e2e/apply-default-icon-unit.spec.ts).
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  const value = args[i + 1]
  args.splice(i, 2)
  return value
}
const root = flag('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const tag = flag('--tag')

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

// The id a tag's annotation names. The checkout may hold the tag as a
// lightweight ref (actions/checkout does that for a tag ref), so fetch the tag
// object itself first.
function iconFromTag(name) {
  if (!/^store\/v\d+\.\d+\.\d+$/.test(name)) fail(`Tag ${name} isn't store/vMAJOR.MINOR.PATCH.`)
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim()
  git('fetch', '--quiet', '--force', 'origin', `refs/tags/${name}:refs/tags/${name}`)
  if (git('cat-file', '-t', `refs/tags/${name}`) !== 'tag') return 'classic'
  const line = git('tag', '--list', '--format=%(contents)', name)
    .split('\n')
    .find((l) => l.startsWith('default_icon:'))
  return line ? line.slice('default_icon:'.length).trim() : 'classic'
}

const id = tag ? iconFromTag(tag) : args[0]
if (!id) fail('Usage: node scripts/apply-default-icon.mjs <classic|season-...> | --tag store/vX.Y.Z')
if (id !== 'classic' && !/^season-[a-z]+(-[a-z]+)*$/.test(id)) fail(`Unknown icon ${id}: use classic or a season-* id.`)

const envFile = join(root, '.env.production.local')
const setEnv = (value) => {
  const kept = existsSync(envFile)
    ? readFileSync(envFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('VITE_DEFAULT_APP_ICON='))
    : []
  if (value) kept.push(`VITE_DEFAULT_APP_ICON=${value}`)
  if (kept.length || existsSync(envFile)) writeFileSync(envFile, kept.length ? `${kept.join('\n')}\n` : '')
}

if (id === 'classic') {
  setEnv(null)
  console.log('Default icon: classic (nothing to change).')
  process.exit(0)
}

const res = join(root, 'android/app/src/main/res')
const name = `ic_launcher_${id.replace(/-/g, '_')}`
const iosSet = join(root, `ios/App/App/Assets.xcassets/${id}.appiconset/${id}-1024.png`)
const iosDefault = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
for (const file of [join(res, `mipmap-anydpi-v26/${name}.xml`), join(res, `mipmap-anydpi-v26/${name}_round.xml`), iosSet]) {
  if (!existsSync(file)) fail(`No ${id} icon: ${file} is missing (scripts/generate-seasonal-icons.mjs makes it).`)
}

// The application and the Classic alias are the only two users of the default
// icon, so exactly two of each attribute change.
const manifestPath = join(root, 'android/app/src/main/AndroidManifest.xml')
let manifest = readFileSync(manifestPath, 'utf8')
for (const [attr, from, to] of [
  ['icon', '@mipmap/ic_launcher', `@mipmap/${name}`],
  ['roundIcon', '@mipmap/ic_launcher_round', `@mipmap/${name}_round`],
]) {
  const old = `android:${attr}="${from}"`
  const count = manifest.split(old).length - 1
  if (count !== 2) fail(`Expected 2 of ${old} in AndroidManifest.xml, found ${count}.`)
  manifest = manifest.replaceAll(old, `android:${attr}="${to}"`)
}
writeFileSync(manifestPath, manifest)
copyFileSync(iosSet, iosDefault)
setEnv(id)
console.log(`Default icon: ${id} (Android manifest, iPhone AppIcon, VITE_DEFAULT_APP_ICON).`)
