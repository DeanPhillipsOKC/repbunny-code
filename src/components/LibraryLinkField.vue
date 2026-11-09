<script setup lang="ts">
// The edit sheet's "Library match" row (follow-up to #136): shows what this
// exercise counts as in the library, and links, changes, or unlinks it by
// hand. Edits a draft library id; the sheet saves it with the rest of the
// form. Only entries tracked the same way (load type) are offered, since a
// link never changes how sets are logged.
import { computed, nextTick, ref } from 'vue'
import { LIBRARY_BY_NAME, findLibraryMatch, libraryEntry, libraryMatchesSearch, librarySubline, type LibraryExercise } from '../lib/exerciseLibrary'
import { closeLibraryMatches, suggestLibraryLink } from '../lib/libraryLink'
import type { LoadType } from '../lib/types'

const props = defineProps<{ name: string; loadType: LoadType }>()
const libraryId = defineModel<string | null>({ required: true })

const linked = computed(() => (libraryId.value ? libraryEntry(libraryId.value) : null))
const nameMatch = computed(() => (libraryId.value ? null : findLibraryMatch(props.name)))
const unlinked = computed(() => !libraryId.value && !nameMatch.value)
// Issue #488: the closest entries first, so a near miss ("Lat Pull") needs one
// tap instead of a search. The best one also leads when it's a strong match.
const closeMatches = computed(() => (unlinked.value ? closeLibraryMatches(props.name, props.loadType) : []))
const suggestion = computed(() => (unlinked.value ? (suggestLibraryLink(props.name, props.loadType) ?? closeMatches.value[0] ?? null) : null))
const otherMatches = computed(() => closeMatches.value.filter((e) => e.id !== suggestion.value?.id))

const picking = ref(false)
const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

const RESULT_LIMIT = 8
const matches = computed(() =>
  LIBRARY_BY_NAME.filter((e) => e.loadType === props.loadType && libraryMatchesSearch(e, query.value)),
)

async function openPicker() {
  query.value = ''
  picking.value = true
  await nextTick()
  searchInput.value?.focus({ preventScroll: true })
}

function pick(entry: LibraryExercise) {
  libraryId.value = entry.id
  picking.value = false
}
</script>

<template>
  <div class="link-field" role="group" aria-labelledby="library-link-label">
    <span id="library-link-label" class="link-title">Library match</span>
    <p class="link-status" data-testid="library-link-status">
      <template v-if="linked">Linked to <b>{{ linked.name }}</b></template>
      <template v-else-if="nameMatch">Matches <b>{{ nameMatch.name }}</b> by its name</template>
      <template v-else>Not linked</template>
    </p>

    <p v-if="suggestion && !picking" class="link-suggest">
      Looks like <b>{{ suggestion.name }}</b>.
      <button type="button" class="link-inline" @click="libraryId = suggestion.id">Link it</button>
    </p>

    <div v-if="otherMatches.length && !picking" class="link-others" role="group" aria-label="Other close matches">
      <button v-for="entry in otherMatches" :key="entry.id" type="button" class="link-chip" @click="libraryId = entry.id">
        {{ entry.name }}
      </button>
    </div>

    <div v-if="!picking" class="link-actions">
      <button type="button" @click="openPicker">{{ linked ? 'Change' : 'Link to library' }}</button>
      <button v-if="linked" type="button" @click="libraryId = null">Unlink</button>
    </div>

    <div v-else class="link-picker">
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        aria-label="Search the library"
        placeholder="Search the library"
        enterkeyhint="search"
        @keydown.enter.prevent
      />
      <ul v-if="matches.length" class="link-results" aria-label="Library exercises">
        <li v-for="entry in matches.slice(0, RESULT_LIMIT)" :key="entry.id">
          <button type="button" class="link-result" @click="pick(entry)">
            <span>{{ entry.name }}</span>
            <small>{{ librarySubline(entry) }}</small>
          </button>
        </li>
      </ul>
      <p v-else class="link-sub">No library exercise tracked this way matches.</p>
      <button type="button" class="link-cancel" @click="picking = false">Cancel</button>
    </div>

    <p class="link-sub">
      A linked exercise counts for strength levels, swap suggestions, and how-to steps. Your name and history stay the
      same.
    </p>
  </div>
</template>

<style scoped>
/* Same card as BarbellSettings and the targets switch. */
.link-field {
  margin: 0 0 4px;
  padding: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.link-title {
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--text);
}

.link-status,
.link-suggest {
  margin: 4px 0 0;
  font-size: 0.86rem;
  color: var(--text);
}

.link-suggest {
  color: var(--text-dim);
}

.link-inline {
  min-height: 0;
  padding: 0;
  background: none;
  border: none;
  color: var(--accent);
  font-weight: 800;
  text-decoration: underline;
}

.link-others {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.link-chip {
  min-height: 36px;
  padding: 0 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
  font-size: 0.82rem;
}

.link-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.link-actions button,
.link-cancel {
  min-height: 40px;
  padding: 0 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
  font-size: 0.86rem;
}

.link-picker {
  margin-top: 10px;
}

.link-results {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.link-result {
  width: 100%;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 6px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
  font-size: 0.88rem;
  text-align: left;
}

.link-result small {
  font-weight: 600;
  font-size: 0.72rem;
  color: var(--text-dim);
}

.link-cancel {
  margin-top: 8px;
}

.link-sub {
  margin: 8px 0 0;
  font-size: 0.74rem;
  color: var(--text-dim);
}
</style>
