<script setup lang="ts">
// Persistent bottom tab bar (docs/backlog.md item 41), replacing the
// hamburger-drawer nav (AppMenu.vue, item 18). Design source: canvas "Home"
// artboard bottom nav (docs/backlog.md, item 41 mockup link).
import { useRoute } from 'vue-router'

// Issue #6: the template editor is its own flat route, so exact-active
// matching alone would leave no tab lit there.
const route = useRoute()

// Issue #44: the Progress tab's sections (the Body tab folded in here).
const PROGRESS_SECTIONS = ['workout-log', 'lift-progress', 'muscle-progress', 'muscle-detail', 'milestones', 'progress-report', 'strength-levels', 'template-progress', 'template-progress-detail', 'training-calendar', 'body']
</script>

<template>
  <nav class="bottom-nav" aria-label="Primary">
    <div class="bottom-nav-inner">
      <router-link :to="{ name: 'home' }" class="nav-tab" exact-active-class="active">
        <span class="tab-icon">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 11.5L12 4l8 7.5" stroke="currentColor" stroke-width="1.9" />
            <path
              d="M6 10v9a1 1 0 001 1h3v-5a2 2 0 012-2v0a2 2 0 012 2v5h3a1 1 0 001-1v-9"
              stroke="currentColor"
              stroke-width="1.9"
            />
          </svg>
        </span>
        <span class="tab-label">Home</span>
      </router-link>

      <router-link
        :to="{ name: 'progress' }"
        class="nav-tab"
        :class="{ active: PROGRESS_SECTIONS.includes(route.name as string) }"
        exact-active-class="active"
      >
        <span class="tab-icon">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="15 7 21 7 21 13" />
          </svg>
        </span>
        <span class="tab-label">Progress</span>
      </router-link>

      <router-link
        :to="{ name: 'templates' }"
        class="nav-tab"
        :class="{ active: route.name === 'template-edit' }"
        exact-active-class="active"
      >
        <span class="tab-icon">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="7" width="13" height="9" rx="2.5" stroke="currentColor" stroke-width="1.8" />
            <rect x="7.5" y="3.5" width="13" height="9" rx="2.5" stroke="currentColor" stroke-width="1.8" opacity="0.55" />
          </svg>
        </span>
        <span class="tab-label">Routines</span>
      </router-link>

      <router-link
        :to="{ name: 'exercises' }"
        class="nav-tab"
        :class="{ active: route.name === 'library-exercise' }"
        exact-active-class="active"
      >
        <span class="tab-icon">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
            <rect x="2.5" y="9.5" width="3" height="5" rx="1" fill="currentColor" />
            <rect x="18.5" y="9.5" width="3" height="5" rx="1" fill="currentColor" />
            <rect x="5.5" y="8" width="2.4" height="8" rx="1" fill="currentColor" />
            <rect x="16" y="8" width="2.4" height="8" rx="1" fill="currentColor" />
            <rect x="8" y="11" width="8" height="2" rx="1" fill="currentColor" />
          </svg>
        </span>
        <span class="tab-label">Exercises</span>
      </router-link>
    </div>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 15;
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}

.bottom-nav-inner {
  max-width: var(--page-max);
  height: var(--bottom-nav-height);
  box-sizing: border-box;
  margin: 0 auto;
  display: flex;
  align-items: center;
  padding: 4px 6px;
}

.nav-tab {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px 2px;
  color: var(--text-dim);
  text-decoration: none;
}

.tab-icon {
  width: 48px;
  height: 30px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-icon svg {
  width: 22px;
  height: 22px;
}

/* Larger-logging follow-up: up from 0.68rem (~11px), the hardest-to-read
   text on the screen. "Routines"/"Exercises" at 0.8rem overlap their
   neighbors below ~340px, and at a large Android font size on any phone
   (issue #492), so the label stops growing at 3.6vw: the full 0.8rem at
   375px and wider at the normal font size, 0.7rem at 320px. */
.tab-label {
  font-size: min(0.8rem, 3.6vw);
  font-weight: 700;
  white-space: nowrap;
}

.nav-tab.active .tab-icon {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.nav-tab.active .tab-label {
  color: var(--accent);
  font-weight: 800;
}

/* #880: a phone turned sideways has little height, so each tab becomes a
   single row: the icon beside its label, in a slim bar. */
@media (orientation: landscape) and (max-height: 500px) {
  .nav-tab {
    flex-direction: row;
    justify-content: center;
    gap: 8px;
    padding: 2px;
  }

  .tab-icon {
    width: 34px;
    height: 28px;
  }

  .tab-label {
    font-size: 0.8rem;
  }
}
</style>
