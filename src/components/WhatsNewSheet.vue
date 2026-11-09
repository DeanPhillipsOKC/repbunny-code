<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { releaseNotes } from '../lib/releaseNotes'
import { formatNoteDate, markWhatsNewSeen, noteGuideUrl, noteText, NOTES_PAGE_SIZE, seenBuild, visibleNotes } from '../lib/whatsNew'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #101 (design docs/design/whats-new.html, frame 3): release notes by
// day, newest first, the newest 10 until "Show older". Opening it counts as
// seeing them; the "New" badge reflects what was unseen when it opened. An
// item with a guide (#102) ends in a "How to use it" link to repbunny.app.
// Rendered by AccountSheet.vue in its overlay.
const emit = defineEmits<{ back: []; dismiss: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('back'))

const seenAtOpen = seenBuild.value
const showAll = ref(false)
const notes = computed(() => visibleNotes(releaseNotes, showAll.value))
const hasOlder = computed(() => !showAll.value && releaseNotes.length > NOTES_PAGE_SIZE)

function isNew(build: number, index: number) {
  return index === 0 && seenAtOpen !== null && build > seenAtOpen
}

onMounted(markWhatsNewSeen)
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
    <!-- Pinned, so Back and Close stay in reach however far the notes scroll. -->
    <div class="sheet-top">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-header">
        <button type="button" class="sheet-back" aria-label="Back to Account" @click="emit('back')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 6l-6 6 6 6"></path>
          </svg>
        </button>
        <h3 id="whats-new-title" class="sheet-title">What's new</h3>
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <section
      v-for="(note, index) in notes"
      :key="note.date"
      class="entry"
      :class="{ newest: isNew(note.build, index) }"
      :aria-labelledby="`note-${note.date}`"
    >
      <div class="entry-head">
        <h4 :id="`note-${note.date}`" class="entry-date">{{ formatNoteDate(note.date) }}</h4>
        <span v-if="isNew(note.build, index)" class="badge">New</span>
      </div>
      <ul>
        <li v-for="item in note.items" :key="noteText(item)">
          {{ noteText(item) }}
          <a v-if="noteGuideUrl(item)" class="guide-link" :href="noteGuideUrl(item)!" target="_blank" rel="noopener">
            How to use it<span aria-hidden="true"> ↗</span>
          </a>
        </li>
      </ul>
    </section>

    <button v-if="hasOlder" type="button" class="older" @click="showAll = true">Show older</button>
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
  padding: 10px 16px calc(18px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sheet > * {
  flex-shrink: 0;
}

.sheet-top {
  position: sticky;
  top: -10px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: -10px;
  padding: 10px 0 8px;
  background: var(--bg);
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
  gap: 12px;
  margin-bottom: 2px;
}

.sheet-title {
  flex: 1;
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
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.entry {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
}

.entry.newest {
  border-color: color-mix(in srgb, var(--secondary) 50%, var(--border));
}

.entry-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.entry-date {
  margin: 0;
  font-family: var(--font-body);
  font-weight: 800;
  font-size: 0.92rem;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
}

.badge {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-text);
  background: var(--secondary);
  border-radius: 6px;
  padding: 2px 6px;
}

.entry ul {
  margin: 6px 0 0;
  padding-left: 18px;
  list-style: disc;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--text);
}

.entry li {
  display: list-item;
  list-style: disc;
  margin: 2px 0;
}

.guide-link {
  display: inline-block;
  padding: 2px 0;
  margin-left: 2px;
  color: var(--secondary);
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
}

.older {
  min-height: 44px;
  background: transparent;
  border: none;
  color: var(--secondary);
  font-weight: 800;
  font-size: 0.86rem;
}
</style>
