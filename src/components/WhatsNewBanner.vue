<script setup lang="ts">
import { openAccountSheet } from '../lib/accountSheet'
import { releaseNotes } from '../lib/releaseNotes'
import { chooseTheme, THEMES, themeLabel, themePreview } from '../lib/theme'
import { markWhatsNewSeen, noteText, seenBuild, showWhatsNewBanner, themeNoteSince } from '../lib/whatsNew'

// Issue #101 (design docs/design/whats-new.html, frame 1): a one-time note on
// Home after the app updates, between the title row and the stat tiles. In
// the page flow, not a modal, so it never covers the nav or Start workout.
// Close, or opening the sheet, marks this build seen.
// Issue #887 (docs/design/issue-886-theme-discovery.html, option N2): when an
// unseen note ships a theme, the banner shows that note and a Try it button.
const themed = themeNoteSince(releaseNotes, seenBuild.value)
const newTheme = themed && THEMES.some((t) => t.id === themed.theme) ? themed : null
const body = newTheme ? newTheme.text : releaseNotes[0] ? noteText(releaseNotes[0].items[0]) : ''

function seeWhatsNew() {
  openAccountSheet('whats-new')
}

// Owned or free: switches to it. A Premium theme a free user doesn't have is
// the usual try-before-you-buy preview, on the Theme screen with its Keep it
// with Premium bar (leaving that screen goes back, as it does from Preferences).
function tryTheme() {
  if (!newTheme) return
  markWhatsNewSeen()
  chooseTheme({ theme: newTheme.theme })
  if (themePreview.value) openAccountSheet('theme')
}
</script>

<template>
  <div v-if="showWhatsNewBanner" class="whats-new-banner" role="region" aria-label="RepBunny just updated">
    <span class="banner-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3l2.2 5.2L19 9l-4 3.6L16.2 18 12 15.2 7.8 18 9 12.6 5 9l4.8-.8z" />
      </svg>
    </span>
    <div class="banner-text">
      <p class="banner-title">RepBunny just updated</p>
      <p class="banner-body">{{ body }}</p>
      <div class="banner-actions">
        <button
          v-if="newTheme"
          type="button"
          class="banner-try"
          :aria-label="`Try the ${themeLabel(newTheme.theme)} theme`"
          @click="tryTheme"
        >
          Try it
        </button>
        <button type="button" class="banner-link" @click="seeWhatsNew">See what's new <span aria-hidden="true">›</span></button>
      </div>
    </div>
    <button type="button" class="banner-close" aria-label="Close" @click="markWhatsNewSeen">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.whats-new-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
  padding: 12px 10px 12px 14px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--secondary) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--secondary) 45%, var(--border));
}

.banner-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9px;
  background: color-mix(in srgb, var(--secondary) 20%, transparent);
  color: var(--secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.banner-text {
  flex: 1;
  min-width: 0;
}

.banner-title {
  margin: 0;
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--text);
}

.banner-body {
  margin: 2px 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.banner-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-top: 2px;
}

.banner-try {
  min-height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
  border: none;
  font-size: 0.84rem;
  font-weight: 800;
}

.banner-try:active {
  background: var(--accent-pressed);
}

.banner-link {
  min-height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  font-size: 0.84rem;
  font-weight: 800;
  color: var(--secondary);
}

.banner-close {
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 9px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
