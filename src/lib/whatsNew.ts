import { computed, ref } from 'vue'
import { releaseNotes, type ReleaseNote, type ReleaseNoteItem } from './releaseNotes'

// Issue #101: the What's new sheet (Account > About) and the one-time "just
// updated" banner on Home. Both keys are per device. The seen build is the
// app build the user last acknowledged (closed the banner or opened the
// sheet); the banner shows when the running build is newer and some note
// shipped after the seen build. On a first launch ever the current build is
// stored silently, so a new install never shows the banner.
export const WHATS_NEW_SEEN_KEY = 'repbunny-whats-new-seen'
export const WHATS_NEW_OFF_KEY = 'repbunny-whats-new-off'
export const NOTES_PAGE_SIZE = 10
// Issue #102: how-to guides live on the marketing site (site/guides/).
export const GUIDES_URL = 'https://repbunny.app/guides/'

// "v384+6dcdf63" (or "-dirty") -> 384. "dev" has no number.
export function buildNumber(version: string): number | null {
  const match = /^v(\d+)/.exec(version)
  return match ? Number(match[1]) : null
}

export function hasNotesSince(notes: ReleaseNote[], seen: number | null): boolean {
  return seen !== null && notes.some((note) => note.build > seen)
}

export function visibleNotes(notes: ReleaseNote[], showAll: boolean): ReleaseNote[] {
  return showAll ? notes : notes.slice(0, NOTES_PAGE_SIZE)
}

export function noteText(item: ReleaseNoteItem): string {
  return typeof item === 'string' ? item : item.text
}

export function noteGuideUrl(item: ReleaseNoteItem): string | null {
  return typeof item === 'string' || !item.guide ? null : GUIDES_URL + item.guide
}

// Issue #887: the newest unseen note that ships a theme, or null. Each item's
// own build (`builds`, #610) decides whether it's unseen, so an older theme
// note on the same day as a newer change doesn't come back.
export function themeNoteSince(notes: ReleaseNote[], seen: number | null): { text: string; theme: string } | null {
  if (seen === null) return null
  for (const note of notes) {
    for (const [i, item] of note.items.entries()) {
      const build = note.builds?.[i] ?? note.build
      if (build <= seen) continue
      if (typeof item !== 'string' && item.theme) return { text: item.text, theme: item.theme }
    }
  }
  return null
}

// "2026-10-02" -> "Oct 2, 2026", read as a calendar date (no time zone shift).
export function formatNoteDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or storage off: the banner just won't remember.
  }
}

// typeof keeps this module importable from Node unit specs, where Vite's
// define hasn't replaced the constant.
export const currentBuild = buildNumber(typeof __APP_VERSION__ === 'undefined' ? '' : __APP_VERSION__)

function initialSeenBuild(): number | null {
  const stored = Number(read(WHATS_NEW_SEEN_KEY) ?? NaN)
  if (Number.isFinite(stored)) return stored
  if (currentBuild === null) return null
  const seen = Math.max(currentBuild, releaseNotes[0]?.build ?? 0)
  write(WHATS_NEW_SEEN_KEY, String(seen))
  return seen
}

export const seenBuild = ref(initialSeenBuild())
export const whatsNewBannerOn = ref(read(WHATS_NEW_OFF_KEY) !== '1')

export const whatsNewUnread = computed(() => hasNotesSince(releaseNotes, seenBuild.value))

export const showWhatsNewBanner = computed(
  () =>
    whatsNewBannerOn.value &&
    currentBuild !== null &&
    seenBuild.value !== null &&
    currentBuild > seenBuild.value &&
    whatsNewUnread.value,
)

// Stores the running build, or the newest note's if that's higher (a dev
// build one commit behind its own notes), so the dot can't stick.
export function markWhatsNewSeen() {
  if (currentBuild === null) return
  seenBuild.value = Math.max(currentBuild, seenBuild.value ?? 0, releaseNotes[0]?.build ?? 0)
  write(WHATS_NEW_SEEN_KEY, String(seenBuild.value))
}

export function setWhatsNewBannerOn(on: boolean) {
  whatsNewBannerOn.value = on
  write(WHATS_NEW_OFF_KEY, on ? '0' : '1')
}
