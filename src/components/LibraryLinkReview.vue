<script setup lang="ts">
// Follow-up to #136: "Link your exercises". Lists the user's exercises whose
// names look like a library entry (lib/libraryLink.ts) and asks about each
// one: Yes links it (exercises.library_id), so it counts for strength levels,
// swap suggestions, the plate calculator's barbell guess, and the library's
// how-to; No is remembered on the device and never asked again. Opened from
// the Exercises tab's banner and the Strength levels card (?for=strength,
// which lists only exercises that would get a level).
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExercisesStore } from '../stores/exercises'
import { findLibraryMatch, librarySubline } from '../lib/exerciseLibrary'
import { dismissLinkSuggestion, dismissedLinks, pendingLinkSuggestions, type LinkSuggestion } from '../lib/libraryLink'
import { liftForExercise } from '../lib/strengthLevels'

const exercises = useExercisesStore()
const route = useRoute()
const router = useRouter()

const forStrength = computed(() => route.query.for === 'strength')

interface Row extends LinkSuggestion {
  answer: 'linked' | 'kept' | null
}

const rows = ref<Row[]>([])
const loaded = ref(false)
const busyId = ref<string | null>(null)
const errorMessage = ref('')

function matchName(name: string): string | null {
  return findLibraryMatch(name)?.id ?? null
}

// Snapshot once, like the muscle check: answered rows stay on screen with
// their answer instead of disappearing under the user's thumb.
function buildRows() {
  rows.value = pendingLinkSuggestions(exercises.exercises, dismissedLinks.value)
    .filter(
      (s) =>
        !forStrength.value ||
        // Would get a level once linked, and doesn't already by its name.
        (!liftForExercise({ library_id: null, name: s.name, load_type: s.entry.loadType }, matchName) &&
          liftForExercise({ library_id: s.entry.id, name: s.name, load_type: s.entry.loadType }, () => null)),
    )
    .map((s) => ({ ...s, answer: null }))
  loaded.value = true
}

onMounted(async () => {
  if (!exercises.fetched) await exercises.fetchExercises()
  buildRows()
})

async function link(row: Row) {
  errorMessage.value = ''
  busyId.value = row.exerciseId
  const { error } = await exercises.setLibraryLink(row.exerciseId, row.entry.id)
  busyId.value = null
  if (error) {
    errorMessage.value = error.message
    return
  }
  row.answer = 'linked'
}

function keep(row: Row) {
  dismissLinkSuggestion(row.exerciseId, row.entry.id)
  row.answer = 'kept'
}

function leave() {
  if (typeof router.options.history.state.back === 'string') router.back()
  else router.replace({ name: 'exercises' })
}
</script>

<template>
  <div class="link-review">
    <h2 class="review-title">Link your exercises</h2>
    <p class="review-body">
      These look like exercises in the library. Linking one keeps your name and history, and lets it count for
      strength levels, swap suggestions, and how-to steps.
    </p>

    <p v-if="loaded && rows.length === 0" class="review-empty" data-testid="link-review-empty">
      Nothing to review. Every exercise that looks like a library one is linked or answered.
    </p>

    <ul class="review-list">
      <li v-for="row in rows" :key="row.exerciseId" class="review-row" :aria-label="row.name" data-testid="link-row">
        <span class="mine">{{ row.name }}</span>
        <span class="question">
          Same as <b>{{ row.entry.name }}</b>?
          <small>{{ librarySubline(row.entry) }}</small>
        </span>
        <span v-if="row.answer === 'linked'" class="answer linked" role="status">Linked</span>
        <span v-else-if="row.answer === 'kept'" class="answer" role="status">Kept separate</span>
        <span v-else class="actions">
          <button type="button" class="yes" :disabled="busyId === row.exerciseId" @click="link(row)">Yes, link it</button>
          <button type="button" class="no" :disabled="busyId === row.exerciseId" @click="keep(row)">No</button>
        </span>
      </li>
    </ul>

    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <p class="review-note">Not the right match? Link any exercise by hand from its edit screen, under Library match.</p>

    <button type="button" class="btn-accent" @click="leave">Done</button>
  </div>
</template>

<style scoped>
.link-review {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}

.review-title {
  margin: 0;
  font-family: var(--font-display, inherit);
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.2;
  /* The global h2 is a small uppercase section label; this is a title. */
  text-transform: none;
  letter-spacing: normal;
  color: var(--text);
}

.review-body,
.review-note,
.review-empty {
  margin: 4px 0 14px;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.review-note {
  margin: 12px 0 0;
  font-size: 0.76rem;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.review-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.mine {
  font-weight: 800;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.question {
  font-size: 0.86rem;
  color: var(--text);
}

.question small {
  display: block;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.actions button {
  min-height: 44px;
  font-weight: 800;
}

.yes {
  flex: 1;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.no {
  padding: 0 18px;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
}

.answer {
  margin-top: 6px;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-dim);
}

.answer.linked {
  color: var(--success);
}

.btn-accent {
  margin-top: 14px;
}

.error {
  color: var(--danger);
}
</style>
