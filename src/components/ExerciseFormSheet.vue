<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useExercisesStore, type BarbellFields } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import AlsoWorksPicker from './AlsoWorksPicker.vue'
import BarbellSettings from './BarbellSettings.vue'
import LibraryLinkField from './LibraryLinkField.vue'
import LibrarySuggestion from './LibrarySuggestion.vue'
import LoadTypeSelect from './LoadTypeSelect.vue'
import MergeExerciseSheet from './MergeExerciseSheet.vue'
import MuscleGroupPicker from './MuscleGroupPicker.vue'
import PushPullPicker from './PushPullPicker.vue'
import TimedTrackingSelect from './TimedTrackingSelect.vue'
import { derivedPushPull, isUpperBody } from '../lib/balance'
import { libraryMovementOf, librarySuggestion, type LibraryExercise } from '../lib/exerciseLibrary'
import { useKeyboardViewport } from '../lib/keyboardViewport'
import { useMuscleFirstFields } from '../lib/muscleFirstForm'
import { guessUsesBarbell } from '../lib/plates'
import { hasPremium } from '../lib/premium'
import { setTargetsOff, targetsOffIds } from '../lib/smartTarget'
import type { Exercise, LoadType, PushPull } from '../lib/types'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #63: the Exercises tab's custom exercise form, moved out of the page
// (where it pushed the list three screens down) into a sheet opened from
// "New exercise". `initialName` prefills Name, from the Library's ?new=.
// Issue #91: the same sheet edits an existing exercise when `exercise` is
// set, replacing the form that used to expand inside its row. Barbell
// settings and the load-type lock only show when editing.
// Issue #429: `focusRest` (the rest screen's Edit / Set for links) opens it
// with the rest field focused.
const props = defineProps<{ initialName?: string; exercise?: Exercise; focusRest?: boolean }>()

const emit = defineEmits<{
  dismiss: []
  // The new exercise's load type, so the list can ask for a body weight, and
  // its id, so the Add exercise sheet can pick it (#781).
  created: [loadType: LoadType, id: string]
  saved: []
  // Issue #265: the "You already have" link on a new exercise's name.
  openExisting: [exercise: Exercise]
}>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('dismiss'))

const exercises = useExercisesStore()
const profile = useProfileStore()
const editing = props.exercise ?? null
const title = editing ? 'Edit exercise' : 'New exercise'

const name = ref(editing?.name ?? props.initialName ?? '')
const setupNotes = ref(editing?.setup_notes ?? '')
const restSeconds = ref<number | null>(editing?.rest_seconds ?? null)
// Backlog item 76: Bodyweight/Assisted exist in the type/schema already but
// stayed off this picker until items 78/79 gave them somewhere to go. Item 78
// unhid Bodyweight; item 79 unhides Assisted.
const loadType = ref<LoadType>('weight')
// Backlog item 93: only asked about (and shown) when loadType is 'timed'.
const tracksDistance = ref(editing?.tracks_distance ?? false)
const tracksIncline = ref(editing?.tracks_incline ?? false)
const tracksLevel = ref(editing?.tracks_level ?? false)
const tracksCalories = ref(editing?.tracks_calories ?? false)
// Issue #42: muscle first -- "Add exercise" stays disabled until a group is
// picked. Unlike load type, the group stays editable after sets exist; it
// only decides where progress is counted, not what a set means.
const { muscleGroup, alsoWorks, pickMuscleGroup, pickLoadType } = useMuscleFirstFields(loadType)
if (editing) {
  // Counts as a hand-picked load type, so picking Cardio while editing
  // doesn't switch it to Timed.
  pickLoadType(editing.load_type)
  muscleGroup.value = editing.muscle_group
  alsoWorks.value = [...editing.also_works]
}
const errorMessage = ref('')
const saving = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)

// Issue #22: uses_barbell stays null (guessed) until the switch is touched.
const barbell = ref<BarbellFields>({
  uses_barbell: editing?.uses_barbell ?? null,
  bar_type: editing?.bar_type ?? null,
  bar_custom_weight: editing?.bar_custom_weight ?? null,
  bar_custom_unit: editing?.bar_custom_unit ?? null,
})
const barbellGuess = computed(() => guessUsesBarbell(editing?.library_id ?? null, name.value))

// The Library match row's draft (LibraryLinkField.vue), saved with the form.
const libraryId = ref<string | null>(editing?.library_id ?? null)

// Issue #173: Balance's push or pull, asked only for an upper-body main
// group. Null until tapped, which keeps following the library movement (or
// push for chest); the picker shows that as the pre-selected answer. A
// lower-body group hides it and any stored value is just ignored.
const pushPull = ref<PushPull | null>(editing?.push_pull ?? null)
const showPushPull = computed(() => isUpperBody({ muscle_group: muscleGroup.value }))
const pushPullShown = computed<PushPull | null>(
  () =>
    pushPull.value ??
    derivedPushPull({ name: name.value, library_id: libraryId.value, muscle_group: muscleGroup.value }, libraryMovementOf),
)

// Issue #140: Premium's next-set targets can be turned off per exercise
// (kept on the device, lib/smartTarget.ts). Saved with the rest of the form.
const targetsOn = ref(editing ? !targetsOffIds.value.includes(editing.id) : true)
const showTargetsSwitch = computed(() => !!editing && hasPremium('targets') && (loadType.value === 'weight' || loadType.value === 'level'))

// Backlog item 76: changing load type once an exercise has logged sets would
// make its past sets misread (e.g. a level's weight is always 0), so the
// field is locked once this comes back true.
const hasLoggedSets = ref(false)

// Only a new exercise grabs focus: editing opens without the keyboard,
// unless it was opened for the rest time.
const restInput = ref<HTMLInputElement | null>(null)
onMounted(async () => {
  if (props.focusRest) {
    restInput.value?.scrollIntoView({ block: 'center' })
    restInput.value?.focus({ preventScroll: true })
  }
  if (!editing) {
    nameInput.value?.focus({ preventScroll: true })
    return
  }
  hasLoggedSets.value = await exercises.hasLoggedSets(editing.id)
})

// Lift the sheet above the on-screen keyboard so Add exercise stays reachable.
const { overlayStyle, sheetStyle } = useKeyboardViewport()

// v-model.number leaves an emptied input as '' rather than null/NaN.
// Blank uses the default; 0 is no timer (issue #90).
function restFromDraft(): number | null {
  return typeof restSeconds.value === 'number' && restSeconds.value >= 0 ? Math.round(restSeconds.value) : null
}

function handleSubmit() {
  if (editing) handleSave(editing.id)
  else handleCreate()
}

async function handleCreate() {
  errorMessage.value = ''
  if (!muscleGroup.value || saving.value) return
  const trimmedName = name.value.trim()
  if (!trimmedName) {
    errorMessage.value = 'Name cannot be empty.'
    return
  }
  saving.value = true
  const { data, error } = await exercises.createExercise(
    trimmedName,
    setupNotes.value.trim() || null,
    restFromDraft(),
    loadType.value,
    tracksDistance.value,
    tracksIncline.value,
    tracksLevel.value,
    tracksCalories.value,
    muscleGroup.value,
    alsoWorks.value,
    null,
    pushPull.value,
  )
  saving.value = false
  if (error || !data) {
    errorMessage.value = error?.message ?? 'Could not create exercise.'
    return
  }
  emit('created', loadType.value, data.id)
}

async function handleSave(id: string) {
  errorMessage.value = ''
  if (saving.value) return
  const trimmedName = name.value.trim()
  if (!trimmedName) {
    errorMessage.value = 'Name cannot be empty.'
    return
  }
  saving.value = true
  const { error } = await exercises.updateExercise(
    id,
    trimmedName,
    setupNotes.value.trim() || null,
    restFromDraft(),
    loadType.value,
    tracksDistance.value,
    tracksIncline.value,
    tracksLevel.value,
    tracksCalories.value,
    muscleGroup.value,
    alsoWorks.value,
    barbell.value,
    pushPull.value,
  )
  saving.value = false
  if (error) {
    errorMessage.value = error.message
    return
  }
  if (showTargetsSwitch.value) setTargetsOff(id, !targetsOn.value)
  if (libraryId.value !== (editing?.library_id ?? null)) {
    const { error: linkError } = await exercises.setLibraryLink(id, libraryId.value)
    if (linkError) {
      errorMessage.value = linkError.message
      return
    }
  }
  emit('saved')
}

// Issue #39: a typed name that matches the library offers the entry instead.
// Only when creating; an exercise being edited is already yours.
const suggestion = computed(() => (editing ? null : librarySuggestion(name.value, exercises.ownedLibrary)))
const usingSuggestion = ref(false)

// Issue #265: a new exercise named like one the lifter already has says so,
// but still saves.
const existing = computed(() => {
  const typed = name.value.trim().toLowerCase()
  if (editing || !typed) return null
  return exercises.activeExercises.find((e) => e.name.trim().toLowerCase() === typed) ?? null
})

// Issue #265: Merge into another exercise, from the edit sheet.
const merging = ref(false)
const canMerge = computed(() => !!editing && exercises.activeExercises.some((e) => e.id !== editing.id && e.load_type === editing.load_type))

async function useSuggestion(entry: LibraryExercise) {
  errorMessage.value = ''
  usingSuggestion.value = true
  const { data, error } = await exercises.addFromLibrary(entry)
  usingSuggestion.value = false
  if (error || !data) {
    errorMessage.value = error?.message ?? 'Could not add exercise.'
    return
  }
  emit('created', entry.loadType, data.id)
}
</script>

<template>
  <div class="sheet-overlay" :style="overlayStyle" @click.self="emit('dismiss')">
    <div class="sheet" :style="sheetStyle" role="dialog" aria-modal="true" :aria-label="title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-header">
        <h3 class="sheet-title">{{ title }}</h3>
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <form @submit.prevent="handleSubmit">
        <!-- Name leads: with the group grid first, the "Also works" chips
             right under it read as the main pick. -->
        <label for="exercise-name">Name</label>
        <input id="exercise-name" ref="nameInput" v-model="name" type="text" required />
        <LibrarySuggestion
          v-if="suggestion"
          :entry="suggestion"
          :busy="usingSuggestion"
          @use="useSuggestion(suggestion)"
        />

        <p v-if="existing" class="muscle-hint existing-hint" role="status">
          You already have {{ existing.name }}.
          <button type="button" class="link-button" @click="emit('openExisting', existing)">Open it</button>
        </p>

        <MuscleGroupPicker class="after-name" :model-value="muscleGroup" @update:model-value="pickMuscleGroup" />

        <AlsoWorksPicker v-model="alsoWorks" :exclude="muscleGroup" />

        <div v-if="showPushPull">
          <PushPullPicker :model-value="pushPullShown" legend="Push or pull?" @update:model-value="pushPull = $event" />
          <p class="muscle-hint">Used by Balance on Muscle groups.</p>
        </div>

        <LoadTypeSelect :model-value="loadType" :disabled="hasLoggedSets" @update:model-value="pickLoadType" />
        <p v-if="hasLoggedSets" class="muscle-hint">
          Load type can't be changed once sets have been logged for this exercise. Archive and recreate it instead.
        </p>
        <p v-else-if="!editing" class="muscle-hint">Suggested from the muscle group. Change it anytime.</p>
        <TimedTrackingSelect
          v-if="loadType === 'timed'"
          v-model:tracks-distance="tracksDistance"
          v-model:tracks-incline="tracksIncline"
          v-model:tracks-level="tracksLevel"
          v-model:tracks-calories="tracksCalories"
        />
        <LibraryLinkField v-if="editing" v-model="libraryId" :name="name" :load-type="loadType" />
        <BarbellSettings v-if="editing && loadType === 'weight'" v-model="barbell" :guess="barbellGuess" />
        <div v-if="showTargetsSwitch" class="targets-group">
          <div class="switch-row">
            <span class="group-title" aria-hidden="true">Next-set targets</span>
            <button
              type="button"
              role="switch"
              class="switch"
              :aria-checked="targetsOn"
              aria-label="Next-set targets"
              @click="targetsOn = !targetsOn"
            >
              <span class="knob" aria-hidden="true"></span>
            </button>
          </div>
          <p class="group-sub">Shows a target above your sets while you log, adjusted to how hard last time felt.</p>
        </div>

        <label for="exercise-notes">Setup notes</label>
        <textarea
          id="exercise-notes"
          v-model="setupNotes"
          rows="2"
          placeholder="e.g. seat height 4, incline 30°"
        />

        <label for="exercise-rest">Rest timer (seconds)</label>
        <input
          id="exercise-rest"
          ref="restInput"
          v-model.number="restSeconds"
          type="number"
          inputmode="numeric"
          enterkeyhint="done"
          min="0"
          :placeholder="profile.defaultRestSeconds ? `Default: ${profile.defaultRestSeconds}, 0 = none` : 'e.g. 90'"
        />

        <button v-if="canMerge" type="button" class="merge-button" @click="merging = true">Merge into another exercise</button>

        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

        <div class="actions">
          <button type="button" class="cancel" @click="emit('dismiss')">Cancel</button>
          <button v-if="editing" type="submit" class="save" :disabled="saving">Save</button>
          <button v-else type="submit" class="save" :disabled="!muscleGroup || saving">Add exercise</button>
        </div>
      </form>
    </div>
    <MergeExerciseSheet v-if="merging && editing" :exercise="editing" @dismiss="merging = false" @merged="emit('saved')" />
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
  justify-content: space-between;
}

.sheet-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

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

.muscle-hint {
  margin: 6px 2px 0;
  font-size: 0.72rem;
  color: var(--text-dim);
}

.existing-hint {
  margin-top: 8px;
}

.link-button {
  display: inline;
  min-height: auto;
  padding: 0;
  background: none;
  border: none;
  color: var(--highlight);
  font: inherit;
  text-decoration: underline;
}

.merge-button {
  margin-top: 16px;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}

.error {
  margin: 12px 0 0;
  color: var(--danger);
  font-size: 0.8rem;
}

.after-name {
  margin-top: 16px;
}

/* Same look as BarbellSettings' switch group. */
.targets-group {
  margin: 0 0 4px;
  padding: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.group-title {
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--text);
}

.group-sub {
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.switch {
  position: relative;
  width: 46px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 14px;
  background: var(--border);
  border: none;
}

.switch[aria-checked='true'] {
  background: var(--accent);
}

.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: left 0.15s ease;
}

.switch[aria-checked='true'] .knob {
  left: 21px;
  background: var(--accent-text);
}

/* Pinned to the sheet's bottom so Add exercise / Save stays reachable
   however far the form is scrolled. */
.actions {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 6px;
  padding: 12px 0 calc(16px + env(safe-area-inset-bottom, 0px));
  background: var(--bg);
  border-top: 1px solid var(--border);
}

.actions .save {
  margin-top: 0;
}
</style>
