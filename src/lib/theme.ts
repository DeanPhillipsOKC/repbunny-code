import { computed, ref, watch, watchEffect } from 'vue'
import { hasPremium } from './premium'
import { startSetupThemeTrial } from './trialPass'
import { playablePick } from './extras'

// Issue #107, reworked by #118 and #146: Premium themes. Three per-device
// settings that combine freely:
// - a theme, which sets the whole palette (every color token in style.css's
//   :root, plus color-scheme) and comes with an outfit for the bunny;
// - the outfit (#146): the bunny art, either the theme's own ("Match theme"),
//   a fixed one, or "Holidays", which changes by date (HOLIDAY_OUTFITS);
// - the mascot, Full (the art and celebration motion) or Minimal (just the
//   small bunny-and-dumbbell mark; records and first workouts still say so in
//   text). Minimal is `data-mascot="minimal"` on <html>; style.css hides every
//   `.mascot-art` and stops the celebration motion under it.
//
// Free (#400): the Classic and Chalk themes, either mascot, and the theme's own
// outfit, in any combination. Everything else is Premium. If Premium is ever
// lost (a refund, #105), the saved choice is kept, but only its Premium parts
// fall back to Classic / Match theme. Free users
// can preview any option: it applies at once, and the Theme screen shows a bar
// to keep it with Premium or go back. Leaving the screen reverts.

export type MascotStyle = 'full' | 'minimal'
// 'match' (the theme's own outfit), 'holidays', or an OUTFITS id.
export type OutfitChoice = string
export type ThemeChoice = { theme: string; mascot: MascotStyle; outfit: OutfitChoice }

export const THEME_TOKENS = [
  '--bg',
  '--surface',
  '--surface-2',
  '--border',
  '--text',
  '--text-dim',
  '--accent',
  '--accent-pressed',
  '--accent-text',
  '--secondary',
  '--highlight',
  '--success',
  '--danger',
  '--cardio',
] as const
export type ThemeToken = (typeof THEME_TOKENS)[number]

// Mascot art a theme can replace, and the original each falls back to.
export const ART_FILES = {
  rest: 'rest-bunny.png',
  celebration: 'celebration-bunny.png',
  'celebration-flex': 'celebration-flex-bunny.png',
  'celebration-dumbbell': 'celebration-dumbbell-bunny.png',
  clipboard: 'clipboard-bunny.png',
  library: 'library-bunny.png',
  body: 'body-bunny.png',
  loading: 'loading-bunny.webp',
} as const
export type ArtKey = keyof typeof ART_FILES

// Issue #146: a set of bunny art. Art in public/themes/<id>/ (the folder name
// predates outfits):
// the originals' names in public/, always as .webp (themeArtFile). Keys left
// out use the original.
export type Outfit = { id: string; label: string; art?: ArtKey[] }

const SEASONAL_ART: ArtKey[] = ['rest', 'celebration', 'celebration-flex', 'celebration-dumbbell', 'clipboard', 'library', 'body']

export const OUTFITS: Outfit[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'halloween', label: 'Halloween', art: SEASONAL_ART },
  { id: 'autumn', label: 'Autumn', art: SEASONAL_ART },
  { id: 'christmas', label: 'Christmas', art: SEASONAL_ART },
  { id: 'valentine', label: "Valentine's Day", art: SEASONAL_ART },
  { id: 'easter', label: 'Easter', art: SEASONAL_ART },
]

// What the Holidays outfit wears, by month (0 is January). Months not listed
// wear Classic. A new seasonal outfit adds a row here. A holiday that moves
// gives its month as a function of the year, and its caption says when.
export type HolidayOutfit = { month: number | ((year: number) => number); outfit: string; when?: string }
export const HOLIDAY_OUTFITS: HolidayOutfit[] = [
  { month: 1, outfit: 'valentine' }, // February
  { month: easterMonth, outfit: 'easter', when: "Easter's month" }, // March or April (#970)
  { month: 9, outfit: 'halloween' }, // October
  { month: 10, outfit: 'autumn' }, // November
  { month: 11, outfit: 'christmas' }, // December
]

// Issue #970: the month (0 is January) Easter Sunday falls in, March or
// April, by the anonymous Gregorian computus. 2027 is March 28, 2028 April 16.
export function easterMonth(year: number): number {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  return Math.floor((h + l - 7 * m + 114) / 31) - 1
}

export type Theme = {
  id: string
  label: string
  scheme: 'dark' | 'light'
  tokens: Record<ThemeToken, string>
  // The OUTFITS id "Match theme" wears with this theme (default Classic).
  outfit?: string
  // Issue #124: small touches beyond color and art, each a reusable slot
  // (style.css and DayMark.vue draw them):
  // - dayMark: the This week tracker's mark for a logged day (default paw);
  // - confetti: the record celebration's confetti shape;
  // - corner: a faint decoration in the corner of panels marked .theme-corner.
  decor?: { dayMark?: DayMarkShape; confetti?: 'candy-corn' | 'leaves' | 'carrot' | 'candy-cane' | 'candy-heart'; corner?: CornerShape }
  // Issue #127: what shadows darken toward, when the scheme's SHADE doesn't
  // suit the palette.
  shade?: string
}
export type DayMarkShape = 'candy-corn' | 'maple-leaf' | 'carrot' | 'candy-cane' | 'candy-heart'
export type CornerShape = 'web' | 'leaves'

// Every theme passes WCAG AA and keeps --success and --danger apart from
// --accent (e2e/local/themes.spec.ts checks each one).
export const THEMES: Theme[] = [
  {
    id: 'classic',
    label: 'Classic',
    scheme: 'dark',
    tokens: {
      '--bg': '#17111c',
      '--surface': '#211829',
      '--surface-2': '#241a2c',
      '--border': '#3a2b40',
      '--text': '#f5edf2',
      '--text-dim': '#b9a8c2',
      '--accent': '#f2879c',
      '--accent-pressed': '#ed6b85',
      '--accent-text': '#241a2c',
      '--secondary': '#b79cf0',
      '--highlight': '#f2c069',
      '--success': '#a9cb8d',
      '--danger': '#e0687a',
      '--cardio': '#f4a07a',
    },
  },
  // Issue #121: cute, not spooky. Pumpkin accent on a near-black purple,
  // witch-purple secondary, candy-corn highlight, slime-green success.
  // Cardio moves to pink so it doesn't read as pumpkin.
  {
    id: 'halloween',
    label: 'Halloween',
    scheme: 'dark',
    tokens: {
      '--bg': '#151019',
      '--surface': '#211a29',
      '--surface-2': '#2a2133',
      '--border': '#3d3048',
      '--text': '#f6efe6',
      '--text-dim': '#bfb1c9',
      '--accent': '#ff9a3c',
      '--accent-pressed': '#f5852a',
      '--accent-text': '#1d1418',
      '--secondary': '#b48cf0',
      '--highlight': '#ffd166',
      '--success': '#9be36d',
      '--danger': '#ff6b7a',
      '--cardio': '#f27fb2',
    },
    outfit: 'halloween',
    decor: { dayMark: 'candy-corn', confetti: 'candy-corn', corner: 'web' },
  },
  // Issue #129: maple, rust, and gold on dark bark, to take over from
  // Halloween in November. A warm brown base and a gold accent keep it apart
  // from Halloween's purple and pumpkin.
  {
    id: 'autumn',
    label: 'Autumn',
    scheme: 'dark',
    tokens: {
      '--bg': '#1a1210',
      '--surface': '#251a16',
      '--surface-2': '#2e211b',
      '--border': '#44322a',
      '--text': '#f6ece2',
      '--text-dim': '#c4b2a3',
      '--accent': '#e9a23b',
      '--accent-pressed': '#d98f2a',
      '--accent-text': '#1d130e',
      '--secondary': '#d9785a',
      '--highlight': '#f5d36b',
      '--success': '#a9c46a',
      '--danger': '#ef6f78',
      '--cardio': '#c79ad9',
    },
    outfit: 'autumn',
    decor: { dayMark: 'maple-leaf', confetti: 'leaves', corner: 'leaves' },
  },
  // Issue #968: cute and secular. A cranberry accent (the bunny's fur in the
  // art, redder than Classic's pink) and an evergreen secondary on a wine-plum
  // base, with cream text and a gold highlight. Errors go warm orange so they
  // never read as the accent. Candy canes mark the week and fall as confetti.
  {
    id: 'christmas',
    label: 'Christmas',
    scheme: 'dark',
    tokens: {
      '--bg': '#1b0d14',
      '--surface': '#27141e',
      '--surface-2': '#301a26',
      '--border': '#4c2a3a',
      '--text': '#fbf1e6',
      '--text-dim': '#cfb3b6',
      '--accent': '#ff5c74',
      '--accent-pressed': '#f2475f',
      '--accent-text': '#22101a',
      '--secondary': '#6fcf97',
      '--highlight': '#f3c96b',
      '--success': '#b5dd8a',
      '--danger': '#ff9466',
      '--cardio': '#c7a6f2',
    },
    outfit: 'christmas',
    decor: { dayMark: 'candy-cane', confetti: 'candy-cane' },
  },
  // Issue #969: Valentine's Day. A burgundy base (the ribbons in the art),
  // redder than Classic's plum and Christmas's wine, with a hot pink accent
  // like the bunny's fur, a blush secondary, and a gold highlight. Records go
  // mint and errors warm orange so neither reads as the pink. Candy hearts
  // mark the week and fall as confetti.
  {
    id: 'valentine',
    label: "Valentine's Day",
    scheme: 'dark',
    tokens: {
      '--bg': '#3b0c1e',
      '--surface': '#4a1228',
      '--surface-2': '#561830',
      '--border': '#7d2c48',
      '--text': '#fff0f3',
      '--text-dim': '#efc3d0',
      '--accent': '#ff86b0',
      '--accent-pressed': '#ff6c9d',
      '--accent-text': '#2a0814',
      '--secondary': '#ffbfd0',
      '--highlight': '#f8cf73',
      '--success': '#a3e6b6',
      '--danger': '#ffab70',
      '--cardio': '#cfb0f7',
    },
    outfit: 'valentine',
    decor: { dayMark: 'candy-heart', confetti: 'candy-heart' },
  },
  // Issue #970: Easter, a secular spring. The only pastel light theme: a cream
  // page, white cards, lavender tinted panels like the gingham in the art, a
  // deep lavender accent, robin's egg teal secondary, and butter gold
  // highlight, each darkened to pass AA on the cream. Carrot orange errors and
  // berry cardio. Carrots mark the week and fall as confetti (#128's decor).
  {
    id: 'easter',
    label: 'Easter',
    scheme: 'light',
    tokens: {
      '--bg': '#fffaee',
      '--surface': '#ffffff',
      '--surface-2': '#f3eefc',
      '--border': '#e3d9f2',
      '--text': '#2a2238',
      '--text-dim': '#615873',
      '--accent': '#7048c0',
      '--accent-pressed': '#5e3aa8',
      '--accent-text': '#ffffff',
      '--secondary': '#1f6f86',
      '--highlight': '#8a6400',
      '--success': '#2e7a3d',
      '--danger': '#b5441a',
      '--cardio': '#b0406c',
    },
    outfit: 'easter',
    decor: { dayMark: 'carrot', confetti: 'carrot' },
  },
  // Issue #122: the first light theme. Cream background, white and soft pink
  // cards, berry accent. The issue's starting palette, darkened where it
  // missed AA (accent, secondary, and the status colors, which also show as
  // text on the cards).
  {
    id: 'cotton-candy',
    label: 'Cotton Candy',
    scheme: 'light',
    tokens: {
      '--bg': '#fff7f4',
      '--surface': '#ffffff',
      '--surface-2': '#fdeef0',
      '--border': '#f0d4da',
      '--text': '#2b1d2a',
      '--text-dim': '#6e5868',
      '--accent': '#bf3a65',
      '--accent-pressed': '#a8305a',
      '--accent-text': '#ffffff',
      '--secondary': '#7650c4',
      '--highlight': '#8f5c08',
      '--success': '#2e7a3d',
      '--danger': '#b8322a',
      '--cardio': '#a5532b',
    },
  },
  // Issue #126: no pink anywhere. Chalk white on dark graphite with a
  // steel-blue accent, chalk-gray secondary, and a brass highlight. The
  // original bunny art stays.
  {
    id: 'chalk',
    label: 'Chalk',
    scheme: 'dark',
    tokens: {
      '--bg': '#121417',
      '--surface': '#1b1e23',
      '--surface-2': '#22262c',
      '--border': '#343a42',
      '--text': '#eef1f4',
      '--text-dim': '#a3acb6',
      '--accent': '#8fb4d9',
      '--accent-pressed': '#7aa3cc',
      '--accent-text': '#121417',
      '--secondary': '#b8c4d0',
      '--highlight': '#e6c27a',
      '--success': '#8cc79a',
      '--danger': '#e07a6b',
      '--cardio': '#d9a066',
    },
  },
  // Issue #128: a garden. Carrot-orange accent and leaf-green secondary on
  // dark soil green; the green base keeps it apart from Halloween's pumpkin
  // on purple. Mint success so a record doesn't read as the leaf secondary.
  // Carrots mark the week tracker and fall as confetti; no corner decoration.
  {
    id: 'carrot-patch',
    label: 'Carrot Patch',
    scheme: 'dark',
    tokens: {
      '--bg': '#121710',
      '--surface': '#1b2318',
      '--surface-2': '#222c1e',
      '--border': '#34432e',
      '--text': '#eef3e6',
      '--text-dim': '#aebaa2',
      '--accent': '#f28c3a',
      '--accent-pressed': '#e47a28',
      '--accent-text': '#1a130c',
      '--secondary': '#9ccf7a',
      '--highlight': '#f2d36b',
      '--success': '#7fd6b4',
      '--danger': '#f0707a',
      '--cardio': '#d9a0e0',
    },
    decor: { dayMark: 'carrot', confetti: 'carrot' },
  },
  // Issue #127: a second light theme without Cotton Candy's pink. Warm peach
  // and apricot with a morning-sky secondary. The issue's apricot accent was
  // darkened a step to pass AA on the cream; crimson danger stays clear of it.
  // Cotton Candy's mauve shadow looked pink on peach, so a warm brown instead.
  {
    id: 'sunrise',
    label: 'Sunrise',
    scheme: 'light',
    tokens: {
      '--bg': '#fff8f0',
      '--surface': '#ffffff',
      '--surface-2': '#fff0e2',
      '--border': '#f2dcc6',
      '--text': '#2a1e16',
      '--text-dim': '#6e5a4a',
      '--accent': '#b8501c',
      '--accent-pressed': '#9a4012',
      '--accent-text': '#ffffff',
      '--secondary': '#3f6fb0',
      '--highlight': '#8a6400',
      '--success': '#2e7a3d',
      '--danger': '#a8233a',
      '--cardio': '#9a4f8f',
    },
    shade: '#b07a52',
  },
]

// Issue #122: what shadows darken toward, by scheme (style.css --shade).
// Black shadows on cream read as gray smudges; a mid mauve reads as a shadow.
// A theme can set its own (#127).
const SHADE: Record<Theme['scheme'], string> = { dark: '#000000', light: '#b0627f' }

function shadeFor(theme: Theme) {
  return theme.shade ?? SHADE[theme.scheme]
}

export const FREE_THEME: ThemeChoice = { theme: 'classic', mascot: 'full', outfit: 'match' }

export function findTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function findOutfit(id: string): Outfit {
  return OUTFITS.find((o) => o.id === id) ?? OUTFITS[0]
}

// #118 replaced the #107 colorway key; a pick stored under it (Lavender,
// Carrot Gold, Sprout) is dropped and the user lands on Classic.
const LEGACY_COLORWAY_KEY = 'repbunny-theme-colorway'
export const THEME_ID_KEY = 'repbunny-theme'
export const THEME_MASCOT_KEY = 'repbunny-theme-mascot'
export const THEME_OUTFIT_KEY = 'repbunny-theme-outfit'

function validOutfit(outfit: string | null): outfit is OutfitChoice {
  return outfit === 'match' || outfit === 'holidays' || OUTFITS.some((o) => o.id === outfit)
}

function readSaved(): ThemeChoice {
  try {
    localStorage.removeItem(LEGACY_COLORWAY_KEY)
    const theme = localStorage.getItem(THEME_ID_KEY)
    const mascot = localStorage.getItem(THEME_MASCOT_KEY)
    const outfit = localStorage.getItem(THEME_OUTFIT_KEY)
    return {
      theme: THEMES.some((t) => t.id === theme) ? theme! : FREE_THEME.theme,
      mascot: mascot === 'minimal' ? 'minimal' : FREE_THEME.mascot,
      outfit: validOutfit(outfit) ? outfit : FREE_THEME.outfit,
    }
  } catch {
    return { ...FREE_THEME }
  }
}

function writeSaved(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_ID_KEY, choice.theme)
    localStorage.setItem(THEME_MASCOT_KEY, choice.mascot)
    localStorage.setItem(THEME_OUTFIT_KEY, choice.outfit)
  } catch {
    // best-effort; the theme still holds for this session
  }
}

const saved = ref<ThemeChoice>(readSaved())

// A free user's try-before-you-buy pick; null when nothing is being previewed.
export const themePreview = ref<ThemeChoice | null>(null)

// What the user has, before any preview.
// A Themes trial pass (#155) counts while it runs; when it ends, the saved
// choice stays but isn't applied, like a lost unlock.
const themesOwned = computed(() => hasPremium('themes'))
// Exported for the home screen widgets (#144), which never show a preview.
export const ownedTheme = computed<ThemeChoice>(() => (themesOwned.value ? saved.value : freePart(saved.value)))

// What's on screen.
export const activeTheme = computed<ThemeChoice>(() => themePreview.value ?? ownedTheme.value)

// #400: what a free user can pick without Premium.
const FREE_THEMES = ['classic', 'chalk']
const FREE_MASCOTS: MascotStyle[] = ['full', 'minimal']
const FREE_OUTFITS = ['match']

export function isFreeOption(choice: Partial<ThemeChoice>) {
  return (
    FREE_THEMES.includes(choice.theme ?? FREE_THEME.theme) &&
    FREE_MASCOTS.includes(choice.mascot ?? FREE_THEME.mascot) &&
    FREE_OUTFITS.includes(choice.outfit ?? FREE_THEME.outfit)
  )
}

// A saved choice with only its Premium parts replaced by the free defaults.
function freePart(choice: ThemeChoice): ThemeChoice {
  return {
    theme: FREE_THEMES.includes(choice.theme) ? choice.theme : FREE_THEME.theme,
    mascot: FREE_MASCOTS.includes(choice.mascot) ? choice.mascot : FREE_THEME.mascot,
    outfit: FREE_OUTFITS.includes(choice.outfit) ? choice.outfit : FREE_THEME.outfit,
  }
}

function sameTheme(a: ThemeChoice, b: ThemeChoice) {
  return a.theme === b.theme && a.mascot === b.mascot && a.outfit === b.outfit
}

// A tap on a theme, Outfit, or Mascot option. With Premium it's saved; without, it
// previews (and picking back to what they have ends the preview).
export function chooseTheme(patch: Partial<ThemeChoice>) {
  const next = { ...activeTheme.value, ...patch }
  if (themesOwned.value || isFreeOption(next)) {
    saved.value = next
    writeSaved(next)
    themePreview.value = null
    return
  }
  themePreview.value = sameTheme(next, ownedTheme.value) ? null : next
}

// "Go back", and leaving the Theme screen without buying.
export function endThemePreview() {
  themePreview.value = null
}

// #1002: leaving setup with a Premium theme previewed (a free user) starts
// the one-time setup Themes trial and keeps the pick. If it can't start (it
// was used, or another trial runs), the preview ends, as a lost unlock does.
export function settleSetupTheme() {
  const preview = themePreview.value
  if (!preview) return
  if (startSetupThemeTrial(preview.theme)) {
    saved.value = preview
    writeSaved(preview)
  }
  themePreview.value = null
}

// Erase all data clears the repbunny- keys (lib/eraseAllData.ts); this puts the
// in-memory choice back to match.
export function resetThemeState() {
  saved.value = readSaved()
  themePreview.value = null
}

export function themeLabel(id: string) {
  return findTheme(id).label
}

export function outfitLabel(choice: OutfitChoice) {
  if (choice === 'match') return 'Match theme'
  if (choice === 'holidays') return 'Holidays'
  return findOutfit(choice).label
}

// The month (and year, for Easter) Holidays goes by. Set on load and when the
// app comes back to the foreground (installTheme), so an app left open over a
// month change catches up.
const currentMonth = ref(new Date().getMonth())
const currentYear = ref(new Date().getFullYear())

// What the Holidays outfit wears this month.
export const holidayOutfit = computed(() => {
  const row = HOLIDAY_OUTFITS.find((h) => (typeof h.month === 'function' ? h.month(currentYear.value) : h.month) === currentMonth.value)
  return findOutfit(row?.outfit ?? 'classic')
})

// The outfit a theme wears under an Outfit choice.
export function resolveOutfit(theme: Theme, choice: OutfitChoice): Outfit {
  if (choice === 'match') return findOutfit(theme.outfit ?? 'classic')
  if (choice === 'holidays') return holidayOutfit.value
  return findOutfit(choice)
}

// "Valentine's Day in February, Easter in Easter's month, Halloween in
// October, Autumn in November, Christmas in December, Classic the rest of the
// year".
export const holidaysCaption = (() => {
  const months = (m: number) => new Date(2000, m, 1).toLocaleString('en-US', { month: 'long' })
  const rows = HOLIDAY_OUTFITS.map((h) => `${findOutfit(h.outfit).label} in ${h.when ?? months(typeof h.month === 'number' ? h.month : 0)}`)
  return `${rows.join(', ')}, Classic the rest of the year`
})()

const activeOutfit = computed(() => resolveOutfit(findTheme(activeTheme.value.theme), activeTheme.value.outfit))

// The image for a mascot slot in the active theme and outfit. Reactive when
// called from a template or computed, so art swaps with either.
export function themeArt(key: ArtKey): string {
  return outfitArt(activeOutfit.value, key)
}

// A given theme's image for a slot under the current Outfit choice, whatever
// theme is active (the Theme screen's previews, #119).
export function artFor(theme: Theme, key: ArtKey): string {
  return outfitArt(resolveOutfit(theme, activeTheme.value.outfit), key)
}

export function outfitArt(outfit: Outfit, key: ArtKey): string {
  return outfit.art?.includes(key) ? `/themes/${outfit.id}/${themeArtFile(key)}` : `/${ART_FILES[key]}`
}

// Issue #130: a theme's own art is WebP (a fraction of the PNG's size), so a
// slot's theme file is the original's name with a .webp extension.
export function themeArtFile(key: ArtKey): string {
  return ART_FILES[key].replace(/\.\w+$/, '.webp')
}

// The original art for a theme art URL ('/themes/halloween/rest-bunny.webp'
// gives '/rest-bunny.png'), or null for anything else.
export function defaultArtFor(src: string): string | null {
  const match = /\/themes\/[^/]+\/([^/?#]+)$/.exec(src)
  if (!match) return null
  const key = (Object.keys(ART_FILES) as ArtKey[]).find((k) => themeArtFile(k) === match[1])
  return key ? `/${ART_FILES[key]}` : null
}

// Inline style that draws an element and everything in it in a given theme:
// its tokens as custom properties, so var(--accent) inside resolves to that
// theme's accent (#119).
export function themeStyle(theme: Theme): Record<string, string> {
  return { ...theme.tokens, '--shade': shadeFor(theme), colorScheme: theme.scheme }
}

// The active theme's decorations (#124); empty for themes without any.
export const themeDecor = computed(() => findTheme(activeTheme.value.theme).decor ?? {})

// Unlocking (or starting a Themes trial) while previewing keeps the preview
// ("Keep it with Premium").
watch(themesOwned, (premium) => {
  if (!premium || !themePreview.value) return
  saved.value = themePreview.value
  writeSaved(themePreview.value)
  themePreview.value = null
})

// Called once from main.ts: keeps <html> (and the browser's theme-color) in
// step with the active theme.
export function installTheme() {
  const root = document.documentElement
  watchEffect(() => {
    const { theme: id, mascot } = activeTheme.value
    const theme = findTheme(id)
    for (const name of THEME_TOKENS) root.style.setProperty(name, theme.tokens[name])
    root.style.setProperty('--shade', shadeFor(theme))
    root.style.colorScheme = theme.scheme
    root.dataset.theme = theme.id
    root.dataset.mascot = mascot
    const decor = theme.decor ?? {}
    // Issue #154: an Extras confetti pick overrides the theme's.
    const extraConfetti = playablePick('confetti')
    const confetti = extraConfetti !== 'match' ? extraConfetti : decor.confetti
    if (confetti) root.dataset.confetti = confetti
    else delete root.dataset.confetti
    if (decor.corner) root.dataset.corner = decor.corner
    else delete root.dataset.corner
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = theme.tokens['--bg']
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      currentMonth.value = new Date().getMonth()
      currentYear.value = new Date().getFullYear()
    }
  })
  // Issue #130: a theme image that can't load (missing) shows the original bunny instead of a broken image. Image
  // errors don't bubble, so this listens in the capture phase.
  document.addEventListener(
    'error',
    (event) => {
      const img = event.target
      if (!(img instanceof HTMLImageElement)) return
      const fallback = defaultArtFor(new URL(img.src, location.href).pathname)
      if (fallback) img.src = fallback
    },
    true,
  )
}
