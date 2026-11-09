import { Capacitor, registerPlugin } from '@capacitor/core'
import { ref } from 'vue'
import { defaultIconImage } from './defaultAppIcon'
import { THEMES } from './theme'

// Issue #145 (Premium, native apps): an alternate home-screen icon per theme,
// picked on the Theme screen's App icon group (ThemeSheet.vue). Its own
// choice, not tied to the theme; Classic by default. The icons are the app
// icon recolored per theme (scripts/generate-theme-icons.mjs): the picker
// shows public/app-icons/<id>.webp, the bunny on the theme's background art
// (#863), and Classic's public/app-icons/classic.png. On Android each icon is a launcher
// activity-alias (AppIconPlugin.java). On the iPhone (#169) each is an
// alternate icon set in Assets.xcassets, switched with setAlternateIconName
// (AppIconPlugin.swift), and iOS confirms every change with its own alert. A
// browser can't change its icon, so the web build never shows the groups.
//
// Issue #841: four seasonal icons (the same bunny on seasonal art, from
// scripts/generate-seasonal-icons.mjs) join the picker in their own group,
// Premium like the rest. The user picks one; the app never switches the icon
// by date, since iOS alerts on every change and some Android launchers drop
// the home-screen shortcut.
//
// The phone remembers the icon itself, so losing Premium keeps it; only
// picking a new one needs Premium (ThemeSheet checks hasPremium('themes')).
//
// Issue #861: Default and Classic are two tiles. Default (id classic, the
// native primary icon: nil on the iPhone, the IconClassic alias on Android) is
// whatever this build ships, seasonal in a store build cut with one (#857).
// Classic (id rose) is an alternate icon with the rose art all year. Both are
// free. The Halloween and Autumn themes lost their flat icons to the seasonal
// ones, and a phone still on one moves at launch (loadAppIcon).

export interface AppIconPlugin {
  getName(): Promise<{ name: string }>
  setName(options: { name: string }): Promise<void>
}

const AppIcon = registerPlugin<AppIconPlugin>('AppIcon', {
  web: () => import('./appIconWeb').then((m) => new m.AppIconWeb()),
})

// The web stand-in counts as available so the e2e suite's browser local mode
// runs the same path.
export const appIconAvailable =
  Capacitor.getPlatform() === 'web' || Capacitor.isPluginAvailable('AppIcon')

export interface AppIconChoice {
  id: string
  label: string
  image: string
  seasonal?: boolean
  caption?: string
}

// Christmas (#968) has the Christmas seasonal icon instead of a theme icon.
// Valentine's Day (#969) and Easter (#970) have no flat icon either, like the
// other holiday themes.
const NO_ICON = ['classic', 'halloween', 'autumn', 'christmas', 'valentine', 'easter']

export const APP_ICONS: AppIconChoice[] = [
  {
    id: 'classic',
    label: 'Default',
    image: defaultIconImage(import.meta.env.VITE_DEFAULT_APP_ICON),
    caption: 'Changes with the seasons',
  },
  { id: 'rose', label: 'Classic', image: '/app-icons/classic.png' },
  ...THEMES.filter((theme) => !NO_ICON.includes(theme.id)).map((theme) => ({
    id: theme.id,
    label: theme.label,
    image: `/app-icons/${theme.id}.webp`,
  })),
]

// The ids anyone can pick without Premium.
export const FREE_ICONS = ['classic', 'rose']

// Icons that are gone, and where a phone still on one goes.
const RETIRED: Record<string, string> = { halloween: 'season-halloween', autumn: 'season-autumn' }

// Keep in step with SEASONS in scripts/generate-seasonal-icons.mjs, the
// Icon<PascalCase id> aliases in AndroidManifest.xml, and the iPhone's
// ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES in project.pbxproj.
export const SEASONAL_ICONS: AppIconChoice[] = [
  { id: 'season-autumn', label: 'Autumn' },
  { id: 'season-halloween', label: 'Halloween' },
  { id: 'season-snow-globe', label: 'Snow Globe' },
  { id: 'season-christmas', label: 'Christmas' },
].map((icon) => ({ ...icon, image: `/app-icons/${icon.id}.webp`, seasonal: true }))

// How an icon is named on its button and in the preview.
export function appIconName(icon: AppIconChoice) {
  return icon.seasonal ? `${icon.label} seasonal` : icon.label
}

// The icon on the home screen right now; null until read from the phone.
export const currentAppIcon = ref<string | null>(null)

// Runs at launch (main.ts) and when the Theme screen opens.
export async function loadAppIcon() {
  if (!appIconAvailable) return
  try {
    let { name } = await AppIcon.getName()
    if (RETIRED[name]) {
      await AppIcon.setName({ name: RETIRED[name] })
      name = RETIRED[name]
    }
    currentAppIcon.value = [...APP_ICONS, ...SEASONAL_ICONS].some((icon) => icon.id === name) ? name : 'classic'
  } catch {
    currentAppIcon.value = 'classic'
  }
}

// Throws when the phone refuses, so the caller can say so.
export async function setAppIcon(id: string) {
  await AppIcon.setName({ name: id })
  currentAppIcon.value = id
}
