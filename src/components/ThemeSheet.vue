<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  APP_ICONS,
  FREE_ICONS,
  SEASONAL_ICONS,
  appIconAvailable,
  appIconName,
  currentAppIcon,
  loadAppIcon,
  setAppIcon,
  type AppIconChoice,
} from '../lib/appIcon'
import { hasPremium, isPremium, openPremiumSheet, showPremiumNudges } from '../lib/premium'
import {
  OUTFITS,
  THEMES,
  activeTheme,
  artFor,
  chooseTheme,
  endThemePreview,
  findTheme,
  holidayOutfit,
  holidaysCaption,
  isFreeOption,
  outfitArt,
  outfitLabel,
  resolveOutfit,
  themeArt,
  themeLabel,
  themePreview,
  themeStyle,
  type MascotStyle,
  type Theme,
} from '../lib/theme'
import { KINDS, extrasPicks, isUnlocked, markViewed, pickName, readViewed, rewardsOf, type ExtraKind } from '../lib/extras'
import { useMilestoneState } from '../lib/milestoneState'
import AppIconGrid from './AppIconGrid.vue'
import DayMark from './DayMark.vue'
import ExtrasPicker from './ExtrasPicker.vue'
import PremiumMark from './PremiumMark.vue'
import ThemePreview from './ThemePreview.vue'
import TrialNote from './TrialNote.vue'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #107: Account > Preferences > Theme. Picks apply live. With Premium
// they're saved; without, they're a preview, with a bar to keep it with
// Premium (the Premium sheet opens over this one, and unlocking keeps the
// preview) or go back. Leaving this screen without buying also goes back.
// Nudge rules from #114: no pressure copy, one tap to dismiss.
// Issue #119: each theme is a card with a mini phone drawn in that theme
// (its tokens via themeStyle, its bunny, day marks, and corner decoration), and a
// Preview button that opens ThemePreview.vue full screen.
const emit = defineEmits<{ back: []; dismiss: [] }>()

useEscapeClose(() => emit('back')) // #783: Escape, and so Android back, closes this sheet.

const MASCOTS = computed<{ id: MascotStyle; label: string; caption: string; image: string }[]>(() => [
  { id: 'full', label: 'Full', caption: 'Bunny art, confetti on records', image: themeArt('celebration') },
  { id: 'minimal', label: 'Minimal', caption: 'Just the small mark. Records still show in text.', image: '/icon-512.png' },
])

// Issue #146: the Outfit group (mockup docs/design/issue-146-bunny-outfits.html,
// option B). Match theme and Holidays get full rows with a caption; the fixed
// outfits sit two to a row. Every thumbnail is that outfit's bunny, so on any
// theme the user sees what they'd get.
const matchArt = computed(() => outfitArt(resolveOutfit(findTheme(activeTheme.value.theme), 'match'), 'celebration'))
const holidaysArt = computed(() => outfitArt(holidayOutfit.value, 'celebration'))

const previewLabel = computed(() => {
  const preview = themePreview.value
  if (!preview) return ''
  const parts: string[] = []
  if (preview.theme !== 'classic') parts.push(themeLabel(preview.theme))
  if (preview.outfit !== 'match') parts.push(`the ${outfitLabel(preview.outfit)} outfit`)
  if (!parts.length) return 'Classic'
  return parts.length === 1 ? parts[0] : `${parts[0]} with ${parts.slice(1).join(' and ')}`
})

const previewing = ref<Theme | null>(null)
// Sun to Sat on the mini phone; four logged days.
const MINI_WEEK = [true, false, true, true, false, true, false]

function locked(free: boolean) {
  return showPremiumNudges.value && !hasPremium('themes') && !free
}

onUnmounted(endThemePreview)

// Issue #145: the App icon group (mockup docs/design/issue-145-app-icons.html,
// option A). With Premium a tap switches the home-screen icon. Without it,
// Default, Classic (#861) and the icon in use stay free, and any other shows a
// home-screen mock with Keep it with Premium / Go back; nothing changes on the
// phone. Unlocking while one shows switches to it. The grids are AppIconGrid.vue.
const iconPreview = ref<AppIconChoice | null>(null)
const iconError = ref(false)

function iconFree(id: string) {
  return FREE_ICONS.includes(id) || id === currentAppIcon.value
}

async function applyIcon(id: string) {
  iconError.value = false
  try {
    await setAppIcon(id)
  } catch {
    iconError.value = true
  }
}

function iconLocked(id: string) {
  return locked(iconFree(id))
}

function pickIcon(icon: AppIconChoice) {
  if (hasPremium('themes') || iconFree(icon.id)) {
    iconPreview.value = null
    if (icon.id !== currentAppIcon.value) void applyIcon(icon.id)
    return
  }
  iconPreview.value = icon
}

watch(
  () => hasPremium('themes'),
  (premium) => {
    const icon = iconPreview.value
    if (!premium || !icon) return
    iconPreview.value = null
    void applyIcon(icon.id)
  },
)

onMounted(loadAppIcon)

// Issue #154: the Extras group (mockup docs/design/issue-154-milestone-rewards.html,
// option B). Premium, earned by milestones (#190); free users see them tagged
// Premium, with only the defaults unlocked. A row per kind shows the current
// pick and how many are unlocked, or a New pill until a just-unlocked one has been seen in
// its picker (ExtrasPicker.vue, shown in place of this screen).
const { counts, ready: countsReady, unlockedTiers } = useMilestoneState()
const extrasKind = ref<ExtraKind | null>(null)
const viewed = ref(readViewed())

const extraRows = computed(() =>
  KINDS.map((info) => {
    const rewards = rewardsOf(info.kind)
    const unlocked = rewards.filter((r) => isUnlocked(r, unlockedTiers.value))
    return {
      ...info,
      current: pickName(info.kind),
      unlockedCount: unlocked.length + 1,
      total: rewards.length + 1,
      fresh: unlocked.some((r) => !viewed.value.has(r.id)),
    }
  }),
)

function openExtras(kind: ExtraKind) {
  const ids = rewardsOf(kind)
    .filter((r) => isUnlocked(r, unlockedTiers.value))
    .map((r) => r.id)
  markViewed(ids)
  viewed.value = readViewed()
  extrasKind.value = kind
}
</script>

<template>
  <ExtrasPicker
    v-if="extrasKind"
    :kind="extrasKind"
    :unlocked-tiers="unlockedTiers"
    :counts="countsReady ? counts : null"
    @back="extrasKind = null"
    @dismiss="emit('dismiss')"
  />
  <div v-else class="sheet" role="dialog" aria-modal="true" aria-labelledby="theme-title">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <button type="button" class="sheet-back" aria-label="Back to Preferences" @click="emit('back')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6"></path>
        </svg>
      </button>
      <h3 id="theme-title" class="sheet-title">Theme</h3>
      <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <TrialNote feature="themes" />

    <div id="theme-color-label" class="group-label">Theme</div>
    <div class="themes" role="group" aria-labelledby="theme-color-label">
      <div v-for="theme in THEMES" :key="theme.id" class="theme-card" :class="{ selected: activeTheme.theme === theme.id }">
        <button
          type="button"
          class="pick"
          :aria-label="theme.label"
          :aria-pressed="activeTheme.theme === theme.id"
          @click="chooseTheme({ theme: theme.id })"
        >
          <span class="mini" :style="themeStyle(theme)" aria-hidden="true">
            <span v-if="theme.decor?.corner" class="mini-corner" :class="theme.decor.corner"></span>
            <span class="mini-title">Log a workout</span>
            <span class="mini-tile">
              <span class="mini-eyebrow">This week</span>
              <span class="mini-week">
                <span v-for="(done, i) in MINI_WEEK" :key="i" class="mini-day" :class="{ done }">
                  <DayMark v-if="done" :mark="theme.decor?.dayMark ?? 'paw'" />
                </span>
              </span>
            </span>
            <img class="mini-bunny" :src="artFor(theme, 'celebration')" alt="" />
            <span class="mini-button">Nice!</span>
          </span>
          <span class="card-label">
            <span class="option-label">{{ theme.label }}</span>
            <span v-if="locked(isFreeOption({ theme: theme.id }))" class="premium-tag">Premium</span>
            <span v-else-if="activeTheme.theme === theme.id" class="check">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </span>
        </button>
        <button type="button" class="peek" :aria-label="`Preview ${theme.label}`" @click="previewing = theme">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
            <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
            <circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="2" />
          </svg>
          Preview
        </button>
      </div>
    </div>

    <div id="theme-mascot-label" class="group-label">Mascot</div>
    <div class="mascots" role="group" aria-labelledby="theme-mascot-label">
      <button
        v-for="mascot in MASCOTS"
        :key="mascot.id"
        type="button"
        class="option mascot"
        :class="{ selected: activeTheme.mascot === mascot.id }"
        :aria-label="mascot.label"
        :aria-pressed="activeTheme.mascot === mascot.id"
        @click="chooseTheme({ mascot: mascot.id })"
      >
        <img class="mascot-thumb" :src="mascot.image" alt="" width="40" height="40" />
        <span class="mascot-text">
          <span class="option-label">{{ mascot.label }}</span>
          <span class="option-caption">{{ mascot.caption }}</span>
        </span>
        <span v-if="locked(isFreeOption({ mascot: mascot.id }))" class="premium-tag" aria-hidden="true">Premium</span>
        <span v-else-if="activeTheme.mascot === mascot.id" class="check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>
    </div>

    <div id="theme-outfit-label" class="group-label">Outfit</div>
    <div class="outfits" :class="{ muted: activeTheme.mascot === 'minimal' }" role="group" aria-labelledby="theme-outfit-label">
      <button
        type="button"
        class="option mascot"
        :class="{ selected: activeTheme.outfit === 'match' }"
        aria-label="Match theme"
        :aria-pressed="activeTheme.outfit === 'match'"
        @click="chooseTheme({ outfit: 'match' })"
      >
        <img class="mascot-thumb" :src="matchArt" alt="" width="40" height="40" />
        <span class="mascot-text">
          <span class="option-label">Match theme</span>
          <span class="option-caption">Wears your theme's outfit</span>
        </span>
        <span v-if="activeTheme.outfit === 'match'" class="check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>
      <button
        type="button"
        class="option mascot"
        :class="{ selected: activeTheme.outfit === 'holidays' }"
        aria-label="Holidays outfit"
        :aria-pressed="activeTheme.outfit === 'holidays'"
        @click="chooseTheme({ outfit: 'holidays' })"
      >
        <img class="mascot-thumb" :src="holidaysArt" alt="" width="40" height="40" />
        <span class="mascot-text">
          <span class="option-label">Holidays</span>
          <span class="option-caption">{{ holidaysCaption }}</span>
        </span>
        <span v-if="locked(false)" class="premium-tag" aria-hidden="true">Premium</span>
        <span v-else-if="activeTheme.outfit === 'holidays'" class="check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>
      <div class="outfit-grid">
        <button
          v-for="outfit in OUTFITS"
          :key="outfit.id"
          type="button"
          class="option outfit"
          :class="{ selected: activeTheme.outfit === outfit.id }"
          :aria-label="`${outfit.label} outfit`"
          :aria-pressed="activeTheme.outfit === outfit.id"
          @click="chooseTheme({ outfit: outfit.id })"
        >
          <img class="outfit-thumb" :src="outfitArt(outfit, 'celebration')" alt="" width="34" height="34" />
          <span class="option-label outfit-label">{{ outfit.label }}<PremiumMark v-if="locked(false)" /></span>
          <span v-if="activeTheme.outfit === outfit.id" class="check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
        </button>
      </div>
    </div>
    <p v-if="activeTheme.mascot === 'minimal'" class="note">Minimal hides the bunny. Outfits show with Full.</p>

    <p class="note">Applies right away, on this device.</p>

    <div id="theme-extras-label" class="group-label">Extras</div>
    <p class="note extras-note">{{ isPremium ? 'Unlocked by your milestones.' : 'Part of Premium, earned by your milestones.' }}</p>
    <div class="extras" role="group" aria-labelledby="theme-extras-label">
      <button
        v-for="row in extraRows"
        :key="row.kind"
        type="button"
        class="extra-row"
        :aria-label="row.title"
        :aria-describedby="`extra-current-${row.kind}`"
        @click="openExtras(row.kind)"
      >
        <span class="extra-icon" aria-hidden="true">
          <DayMark v-if="row.kind === 'weekMark'" />
          <span v-else-if="row.kind === 'confetti'" class="extra-confetti" :data-shape="extrasPicks.confetti === 'match' ? 'plain' : extrasPicks.confetti">
            <i></i><i></i>
          </span>
          <svg v-else-if="row.kind === 'chime'" viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
            <path d="M12 2.5c.8 0 1.4.6 1.4 1.3v.6c3 .7 5 3.3 5 6.4v4.4l1.8 2.3c.4.5 0 1.2-.6 1.2H4.4c-.6 0-1-.7-.6-1.2l1.8-2.3v-4.4c0-3.1 2-5.7 5-6.4v-.6c0-.7.6-1.3 1.4-1.3zM9.6 20h4.8a2.4 2.4 0 01-4.8 0z" />
          </svg>
          <svg v-else-if="row.kind === 'fanfare'" viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
            <path d="M9 4.5l11-2v13.2a3.2 3.2 0 11-2-3V6.6l-7 1.3v10a3.2 3.2 0 11-2-3z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
            <path d="M4 5.5h16a2 2 0 012 2v8a2 2 0 01-2 2h-9l-5 4v-4H4a2 2 0 01-2-2v-8a2 2 0 012-2z" />
          </svg>
        </span>
        <span class="extra-text">
          <span class="option-label">{{ row.title }}</span>
          <span :id="`extra-current-${row.kind}`" class="option-caption">{{ row.current }}</span>
        </span>
        <span v-if="row.fresh" class="extra-new">New</span>
        <span v-else class="extra-count">{{ row.unlockedCount }} of {{ row.total }}</span>
        <svg class="extra-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
    <p class="note">See every milestone in Progress &gt; Milestones.</p>

    <template v-if="appIconAvailable">
      <div id="theme-icon-label" class="group-label">App icon</div>
      <AppIconGrid
        :icons="APP_ICONS"
        labelledby="theme-icon-label"
        :current="currentAppIcon"
        :trying="iconPreview?.id ?? null"
        :locked="iconLocked"
        @pick="pickIcon"
      />
      <!-- Issue #841: picked like the rest, never switched by date. -->
      <div id="theme-seasonal-icon-label" class="group-label">Seasonal icons</div>
      <AppIconGrid
        :icons="SEASONAL_ICONS"
        labelledby="theme-seasonal-icon-label"
        :current="currentAppIcon"
        :trying="iconPreview?.id ?? null"
        :locked="iconLocked"
        @pick="pickIcon"
      />
      <div v-if="iconPreview" class="icon-preview" role="group" aria-label="App icon preview">
        <span class="premium-tag">Premium</span>
        <div class="home" aria-hidden="true">
          <span class="home-app"><span class="home-blank"></span><span>Photos</span></span>
          <span class="home-app"><img :src="iconPreview.image" alt="" /><span>RepBunny</span></span>
          <span class="home-app"><span class="home-blank"></span><span>Maps</span></span>
          <span class="home-app"><span class="home-blank"></span><span>Music</span></span>
        </div>
        <p class="preview-text">
          This is the <strong>{{ appIconName(iconPreview) }}</strong> icon on your home screen. Icons are part of Premium.
        </p>
        <div class="preview-actions">
          <button type="button" class="keep" @click="openPremiumSheet('themes')">Keep it with Premium</button>
          <button type="button" class="go-back" @click="iconPreview = null">Go back</button>
        </div>
      </div>
      <p v-else-if="iconError" class="note icon-error" role="alert">Your phone didn't let the icon change. Try again in a moment.</p>
      <p v-else class="note">Changes the icon on your home screen. Your phone may say so once.</p>
    </template>

    <!-- On body, so it covers the whole screen rather than the sheet. -->
    <Teleport to="body">
      <ThemePreview v-if="previewing" :theme="previewing" @close="previewing = null" />
    </Teleport>

    <div v-if="themePreview" class="preview-bar" role="group" aria-label="Theme preview">
      <p class="preview-text">
        You're trying <strong>{{ previewLabel }}</strong>. It's part of Premium.
      </p>
      <div class="preview-actions">
        <button type="button" class="keep" @click="openPremiumSheet('themes')">Keep it with Premium</button>
        <button type="button" class="go-back" @click="endThemePreview">Go back</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  width: 100%;
  max-width: 480px;
  max-height: min(88vh, var(--sheet-max-h, 88vh));
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet > * {
  flex-shrink: 0;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sheet-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

.sheet-back,
.sheet-close {
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sheet-close {
  color: var(--text-dim);
}

.group-label {
  margin: 2px 2px -4px;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.option {
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
  color: var(--text);
}

.option:active {
  transform: none;
  background: var(--surface-2);
}

.option.selected {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.option-label {
  font-size: 0.92rem;
  font-weight: 700;
}

.premium-tag {
  margin-left: auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 16%, transparent);
  color: var(--secondary);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.themes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.theme-card.selected {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.pick {
  min-height: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: transparent;
  border: none;
  border-radius: 12px;
  color: var(--text);
  text-align: left;
}

.pick:active {
  transform: none;
}

/* A tiny Home screen in the card's own theme (themeStyle sets its tokens). */
.mini {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  height: 168px;
  padding: 9px 8px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
}

.mini-corner {
  position: absolute;
  top: 0;
  right: 0;
  width: 40px;
  height: 40px;
  background: color-mix(in srgb, var(--text) 17%, transparent);
  -webkit-mask: var(--decor-web-spider) no-repeat top right / contain;
  mask: var(--decor-web-spider) no-repeat top right / contain;
}

.mini-corner.leaves {
  -webkit-mask-image: var(--decor-sprig-drift);
  mask-image: var(--decor-sprig-drift);
}

.mini-title {
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
}

.mini-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.mini-eyebrow {
  font-size: 0.5rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.mini-week {
  display: flex;
  gap: 2px;
}

.mini-day {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--text) 9%, transparent);
}

.mini-day.done {
  background: none;
}

.mini-day :deep(.day-mark) {
  width: 13px;
  height: 13px;
}

.mini-day :deep(.candy-corn),
.mini-day :deep(.maple-leaf),
.mini-day :deep(:is(.carrot, .candy-cane, .candy-heart)) {
  width: 15px;
  height: 15px;
}

.mini-bunny {
  align-self: center;
  width: 54px;
  height: 54px;
  object-fit: contain;
}

.mini-button {
  margin-top: auto;
  padding: 5px;
  border-radius: 7px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.66rem;
  font-weight: 800;
  text-align: center;
}

.card-label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  min-height: 22px;
  padding: 0 2px;
}

.card-label .option-label {
  flex: 1 0 auto;
  min-width: 0;
}

.card-label .premium-tag {
  margin-left: 0;
}

.peek {
  margin-top: auto;
  min-height: 38px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 700;
}

.mascots {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mascot {
  min-height: 64px;
  width: 100%;
}

.mascot-thumb {
  width: 40px;
  height: 40px;
  object-fit: contain;
  flex-shrink: 0;
}

.mascot-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.option-caption {
  margin-top: 1px;
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-dim);
}

.outfits {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Under Minimal the art is hidden anyway; still tappable. */
.outfits.muted {
  opacity: 0.5;
}

.outfit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.outfit {
  min-height: 56px;
  min-width: 0;
  padding: 8px 10px;
  gap: 8px;
}

.outfit-thumb {
  width: 34px;
  height: 34px;
  object-fit: contain;
  flex-shrink: 0;
}

.outfit-label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.check {
  color: var(--accent);
  flex-shrink: 0;
  display: flex;
}

.note {
  margin: 0 2px;
  font-size: 0.74rem;
  color: var(--text-dim);
}

/* Issue #154: Extras, one card of rows that each open a picker. */
.extras-note {
  margin-top: -6px;
}

.extras {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}

.extra-row {
  min-height: 58px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--text);
  text-align: left;
}

.extra-row + .extra-row {
  border-top: 1px solid var(--border);
}

.extra-row:active {
  transform: none;
  background: var(--surface-2);
}

.extra-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--secondary);
}

.extra-confetti {
  display: flex;
  align-items: center;
  gap: 2px;
}

.extra-confetti i {
  display: block;
  width: 6px;
  height: 9px;
  border-radius: 2px;
  background: var(--accent);
}

.extra-confetti i + i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--highlight);
}

.extra-confetti:not([data-shape='plain']) i {
  width: 11px;
  height: 11px;
  border-radius: 0;
}

.extra-confetti[data-shape='hearts'] i {
  -webkit-mask: var(--extra-heart) no-repeat center / contain;
  mask: var(--extra-heart) no-repeat center / contain;
}

.extra-confetti[data-shape='stars'] i {
  -webkit-mask: var(--extra-star) no-repeat center / contain;
  mask: var(--extra-star) no-repeat center / contain;
}

.extra-confetti[data-shape='plates'] i {
  -webkit-mask: var(--extra-plate) no-repeat center / contain;
  mask: var(--extra-plate) no-repeat center / contain;
}

.extra-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.extra-count {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-dim);
  white-space: nowrap;
}

.extra-new {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.extra-chevron {
  flex-shrink: 0;
  color: var(--text-dim);
}

.icon-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.icon-preview .premium-tag {
  align-self: flex-start;
  margin-left: 0;
}

/* A stand-in phone wallpaper with a row of apps. */
.home {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  height: 128px;
  padding: 0 10px;
  border-radius: 12px;
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--secondary) 50%, var(--shade)) 0%,
    color-mix(in srgb, var(--secondary) 70%, var(--accent)) 55%,
    color-mix(in srgb, var(--accent) 55%, var(--surface)) 100%
  );
}

.home-app {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 0.62rem;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
}

.home-app img,
.home-blank {
  width: 46px;
  height: 46px;
  border-radius: 50%;
}

.home-app img {
  object-fit: cover;
}

.home-blank {
  background: rgba(255, 255, 255, 0.8);
}

.icon-error {
  color: var(--danger);
}

/* Sticks to the bottom of the sheet while a free user previews. */
.preview-bar {
  position: sticky;
  bottom: 0;
  margin: 0 -16px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sheet > :last-child:not(.preview-bar) {
  margin-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
}

.preview-text {
  margin: 0;
  font-size: 0.84rem;
  color: var(--text-dim);
}

.preview-text strong {
  color: var(--text);
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.keep {
  flex: 1;
  min-height: 46px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.keep:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.go-back {
  min-height: 46px;
  padding: 0 16px;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
  font-weight: 700;
}
</style>
