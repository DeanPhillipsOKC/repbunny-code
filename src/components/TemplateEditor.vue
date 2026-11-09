<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExercisesStore } from '../stores/exercises'
import { useTemplatesStore } from '../stores/templates'
import { useWorkoutsStore } from '../stores/workouts'
import { TEMPLATE_CATEGORY_LABELS, TEMPLATE_CATEGORY_TINTS, type TemplateCategory } from '../lib/templateCategory'
import type { TemplateExerciseWithName } from '../lib/types'
import { openPremiumSheet } from '../lib/premium'
import AddExerciseSheet from './AddExerciseSheet.vue'
import CategoryIcon from './CategoryIcon.vue'
import PageHeader from './PageHeader.vue'

// Issue #6: full-screen template editor, replacing TemplateManager.vue's
// inline expand. Built true to docs/design/issue-6-template-editor.html
// (panel 4): header with inline rename, compact category chips, one card per
// exercise with a drag grip, a sets stepper that saves on tap, and a trash
// button backed by an Undo toast.
const route = useRoute()
const router = useRouter()
const templates = useTemplatesStore()
const exercises = useExercisesStore()
const workout = useWorkoutsStore()

const templateId = computed(() => String(route.params.id))
const template = computed(() => templates.activeTemplates.find((t) => t.id === templateId.value) ?? null)
const templateExercises = computed(() => templates.exercisesByTemplate[templateId.value] ?? [])

const errorMessage = ref('')

onMounted(async () => {
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
  if (workout.recentlyLoggedExerciseIds.length === 0) workout.fetchRecentlyLoggedExercises()
  await openTemplate()
})

// Issue #399: "Add another routine" moves to the next routine's editor, and
// the router reuses this component for it, so the setup runs again.
watch(templateId, () => {
  errorMessage.value = ''
  editingName.value = false
  openTemplate()
})

async function openTemplate() {
  if (!template.value) await templates.fetchTemplates()
  // Archived, deleted, or someone else's: nothing to edit here.
  if (!template.value) {
    router.replace({ name: 'templates' })
    return
  }
  if (route.query.add) {
    openSheet()
    // Issue #399: the setup wizard's program offer stays for this routine.
    router.replace({ query: buildingProgram.value ? { program: '1' } : {} })
  }
  if (!templates.exercisesByTemplate[templateId.value]) {
    const { error } = await templates.fetchTemplateExercises(templateId.value)
    if (error) errorMessage.value = error.message
  }
}

// --- Building a program (issue #399) ---

// From the setup wizard's "Create my own program": once this routine has an
// exercise, offer the next one or Done, so a whole week can be set up in a
// row. Done lands on Home, where the routines are listed.
const buildingProgram = computed(() => route.query.program === '1')
const nextRoutineOpen = ref(false)
const nextRoutineName = ref('')
const nextRoutineError = ref('')

async function addAnotherRoutine() {
  if (!(await templates.canCreateTemplate())) {
    openPremiumSheet('templates')
    return
  }
  nextRoutineName.value = ''
  nextRoutineError.value = ''
  nextRoutineOpen.value = true
}

async function createNextRoutine() {
  nextRoutineError.value = ''
  const { data, error } = await templates.createTemplate(nextRoutineName.value)
  if (error || !data) {
    nextRoutineError.value = error?.message ?? 'Could not create routine.'
    return
  }
  nextRoutineOpen.value = false
  router.push({ name: 'template-edit', params: { id: data.id }, query: { add: '1', program: '1' } })
}

function finishProgram() {
  router.push({ name: 'home' })
}

function goBack() {
  const back = window.history.state?.back
  if (typeof back === 'string' && back.startsWith('/templates')) router.back()
  else router.push({ name: 'templates' })
}

function exerciseName(te: TemplateExerciseWithName): string {
  return te.exercises?.name ?? exercises.exercises.find((e) => e.id === te.exercise_id)?.name ?? 'Unknown'
}

// Backlog item 25 follow-up: checks the live exercises store rather than the
// cached join, which goes stale the moment an exercise still attached here
// gets archived later in the same session.
function isExerciseArchived(id: string): boolean {
  return exercises.exercises.find((e) => e.id === id)?.is_archived ?? false
}

// --- Rename (issue #3) ---

const editingName = ref(false)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

async function startEditingName() {
  if (!template.value) return
  errorMessage.value = ''
  nameDraft.value = template.value.name
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
}

function cancelEditingName() {
  errorMessage.value = ''
  editingName.value = false
}

async function saveName() {
  errorMessage.value = ''
  const trimmedName = nameDraft.value.trim()
  if (!trimmedName) {
    errorMessage.value = 'Name cannot be empty.'
    return
  }
  const { error } = await templates.updateTemplateName(templateId.value, trimmedName)
  if (error) {
    errorMessage.value = error.message
  } else {
    editingName.value = false
  }
}

// --- Category (old item 112) ---

const CATEGORY_OPTIONS: TemplateCategory[] = ['upper', 'lower', 'full', 'cardio', 'core', 'other']
const SHORT_LABELS: Record<TemplateCategory, string> = {
  upper: 'Upper',
  lower: 'Lower',
  full: 'Full',
  cardio: 'Cardio',
  core: 'Core',
  other: 'Other',
}
const savingCategory = ref(false)

async function pickCategory(category: TemplateCategory | null) {
  errorMessage.value = ''
  savingCategory.value = true
  const { error } = await templates.updateTemplateCategory(templateId.value, category)
  savingCategory.value = false
  if (error) errorMessage.value = error.message
}

// --- Sets stepper ---

// Each tap shows its new count at once and queues a save. Saves for one card
// run one at a time and always write the newest count, since overlapping
// requests can land out of order and leave an older count in the database.
const pendingSets = new Map<string, number>()
const setsSaveChains = new Map<string, Promise<void>>()

function stepSets(te: TemplateExerciseWithName, delta: 1 | -1) {
  const current = te.target_sets
  const next = current === null ? (delta > 0 ? 1 : null) : current + delta
  if (next === null || next < 1) return
  errorMessage.value = ''
  te.target_sets = next
  pendingSets.set(te.id, next)
  const chain = (setsSaveChains.get(te.id) ?? Promise.resolve()).then(() => flushSets(te))
  setsSaveChains.set(te.id, chain)
}

async function flushSets(te: TemplateExerciseWithName) {
  const want = pendingSets.get(te.id)
  if (want === undefined) return
  const { error } = await templates.updateTemplateExercise(templateId.value, te.id, want)
  const latest = pendingSets.get(te.id)
  // The store writes `want` back on success; keep showing any newer tap.
  if (latest !== undefined) te.target_sets = latest
  if (latest === want) pendingSets.delete(te.id)
  if (error) {
    pendingSets.delete(te.id)
    errorMessage.value = error.message
    await templates.fetchTemplateExercises(templateId.value)
  }
}

// --- Adding ---

const sheetOpen = ref(false)

function openSheet() {
  sheetOpen.value = true
}

// addExerciseToTemplate reads the list's last position before its insert,
// so two overlapping adds would land on the same position and the second's
// local update would drop the first. Picks queue up and run one at a time.
let addChain: Promise<unknown> = Promise.resolve()
const pendingAddIds = ref<string[]>([])

function enqueueAdd(exerciseId: string, targetSets: number | null) {
  const run = addChain.then(() => templates.addExerciseToTemplate(templateId.value, exerciseId, targetSets))
  addChain = run.catch(() => undefined)
  return run
}

const sheetExercises = computed(() =>
  exercises.activeExercises.map((e) => ({ id: e.id, name: e.name, muscle_group: e.muscle_group })),
)

const addedToTemplate = computed(() => {
  const added: Record<string, number | null> = {}
  for (const te of templateExercises.value) added[te.exercise_id] = te.target_sets
  for (const id of pendingAddIds.value) if (!(id in added)) added[id] = 3
  return added
})

async function handleSheetSelect(exerciseId: string) {
  if (exerciseId in addedToTemplate.value) return
  errorMessage.value = ''
  pendingAddIds.value.push(exerciseId)
  const { error } = await enqueueAdd(exerciseId, 3)
  pendingAddIds.value = pendingAddIds.value.filter((id) => id !== exerciseId)
  if (error) errorMessage.value = error.message
}

function handleSheetManage() {
  sheetOpen.value = false
  router.push({ name: 'exercises' })
}

// --- Removing, with Undo ---

interface RemovedExercise {
  name: string
  exerciseId: string
  targetSets: number | null
  index: number
}

const TOAST_MS = 5000
const removed = ref<RemovedExercise | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

function clearToast() {
  clearTimeout(toastTimer)
  removed.value = null
}

async function removeExercise(te: TemplateExerciseWithName, index: number) {
  errorMessage.value = ''
  const snapshot: RemovedExercise = {
    name: exerciseName(te),
    exerciseId: te.exercise_id,
    targetSets: te.target_sets,
    index,
  }
  const { error } = await templates.removeExerciseFromTemplate(templateId.value, te.id)
  if (error) {
    errorMessage.value = error.message
    return
  }
  clearToast()
  removed.value = snapshot
  toastTimer = setTimeout(clearToast, TOAST_MS)
}

async function undoRemove() {
  const snapshot = removed.value
  if (!snapshot) return
  clearToast()
  errorMessage.value = ''
  const { data, error } = await enqueueAdd(snapshot.exerciseId, snapshot.targetSets)
  if (error || !data) {
    errorMessage.value = error?.message ?? 'Could not restore exercise.'
    return
  }
  const ids = templateExercises.value.map((te) => te.id).filter((id) => id !== data.id)
  ids.splice(Math.min(snapshot.index, ids.length), 0, data.id)
  await persistOrder(ids)
}

onUnmounted(() => clearTimeout(toastTimer))

// --- Reordering ---

async function persistOrder(ids: string[]) {
  const { error } = await templates.reorderExercises(templateId.value, ids)
  if (error) errorMessage.value = error.message
}

function moveTo(fromIndex: number, toIndex: number) {
  const ids = templateExercises.value.map((te) => te.id)
  const [moved] = ids.splice(fromIndex, 1)
  ids.splice(toIndex, 0, moved)
  return persistOrder(ids)
}

// Keyboard/screen-reader path: arrow keys on the focused grip.
async function handleGripKeydown(event: KeyboardEvent, index: number) {
  const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (delta === 0) return
  event.preventDefault()
  const target = index + delta
  if (target < 0 || target >= templateExercises.value.length) return
  const id = templateExercises.value[index].id
  const done = moveTo(index, target)
  await nextTick()
  listEl.value?.querySelector<HTMLElement>(`[data-grip-id="${id}"]`)?.focus()
  await done
}

// Pointer drag: the grabbed card follows the pointer while the cards it
// passes slide out of its way, and a dashed slot marks where it will land.
// Nothing is written until the drop. Capture is taken on the grip itself, so
// the row's own buttons (stepper, trash) are never affected.
const CARD_GAP = 8
const listEl = ref<HTMLElement | null>(null)

interface DragState {
  pointerId: number
  fromIndex: number
  toIndex: number
  startY: number
  dy: number
  listTop: number
  rects: { top: number; height: number }[]
}

const drag = ref<DragState | null>(null)

function handleGripPointerDown(event: PointerEvent, index: number) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (!listEl.value || drag.value) return
  const cards = Array.from(listEl.value.querySelectorAll<HTMLElement>('.ex-card'))
  const rects = cards.map((card) => {
    const rect = card.getBoundingClientRect()
    return { top: rect.top, height: rect.height }
  })
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
  drag.value = {
    pointerId: event.pointerId,
    fromIndex: index,
    toIndex: index,
    startY: event.clientY,
    dy: 0,
    listTop: listEl.value.getBoundingClientRect().top,
    rects,
  }
}

function handleGripPointerMove(event: PointerEvent) {
  const d = drag.value
  if (!d || event.pointerId !== d.pointerId) return
  d.dy = event.clientY - d.startY
  const dragged = d.rects[d.fromIndex]
  const center = dragged.top + dragged.height / 2 + d.dy
  let toIndex = 0
  d.rects.forEach((rect, i) => {
    if (i !== d.fromIndex && center > rect.top + rect.height / 2) toIndex++
  })
  d.toIndex = toIndex
}

function handleGripPointerUp(event: PointerEvent) {
  const d = drag.value
  if (!d || event.pointerId !== d.pointerId) return
  drag.value = null
  if (d.toIndex !== d.fromIndex) moveTo(d.fromIndex, d.toIndex)
}

function handleGripPointerCancel(event: PointerEvent) {
  if (drag.value?.pointerId === event.pointerId) drag.value = null
}

function cardOffset(index: number): number {
  const d = drag.value
  if (!d) return 0
  if (index === d.fromIndex) return d.dy
  const step = d.rects[d.fromIndex].height + CARD_GAP
  if (d.fromIndex < d.toIndex && index > d.fromIndex && index <= d.toIndex) return -step
  if (d.fromIndex > d.toIndex && index >= d.toIndex && index < d.fromIndex) return step
  return 0
}

const dropSlot = computed(() => {
  const d = drag.value
  if (!d || d.toIndex === d.fromIndex) return null
  let top = d.rects[d.fromIndex].top - d.listTop
  if (d.toIndex > d.fromIndex) {
    for (let i = d.fromIndex + 1; i <= d.toIndex; i++) top += d.rects[i].height + CARD_GAP
  } else {
    for (let i = d.toIndex; i < d.fromIndex; i++) top -= d.rects[i].height + CARD_GAP
  }
  return { top: `${top}px`, height: `${d.rects[d.fromIndex].height}px` }
})
</script>

<template>
  <div v-if="template" class="editor" :class="{ 'has-toast': removed }">
    <!-- Issue #276: back link, then the title row with Account (PageHeader),
         like every Progress sub-screen. -->
    <div class="ed-head">
      <button type="button" class="back-link" aria-label="Back to routines" @click="goBack">
        <span aria-hidden="true">‹</span>Routines
      </button>
      <PageHeader>
        <template #title>
          <h1 v-if="!editingName" class="page-title ed-name">
            <button type="button" class="ed-name-btn" title="Rename" @click="startEditingName">
              <span class="ed-name-text">{{ template.name }}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
              </svg>
            </button>
          </h1>
          <form v-else class="name-form" @submit.prevent="saveName">
            <label for="edit-template-name" class="sr-only">Name</label>
            <input id="edit-template-name" ref="nameInput" v-model="nameDraft" type="text" />
            <button type="submit" class="name-save">Save</button>
            <button type="button" class="ghost small" @click="cancelEditingName">Cancel</button>
          </form>
        </template>
      </PageHeader>
    </div>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <div class="category-picker" role="group" aria-labelledby="category-heading">
      <div class="section-label">
        <span id="category-heading">Category</span>
        <button
          v-if="template.category"
          type="button"
          class="aux-btn"
          :disabled="savingCategory"
          @click="pickCategory(null)"
        >
          Use automatic
        </button>
        <span v-else class="aux">Auto: {{ TEMPLATE_CATEGORY_LABELS[templates.categoryOf(template)] }}</span>
      </div>
      <div class="category-options">
        <button
          v-for="option in CATEGORY_OPTIONS"
          :key="option"
          type="button"
          class="category-option"
          :class="{
            selected: template.category === option,
            auto: !template.category && templates.categoryOf(template) === option,
          }"
          :data-category="option"
          :aria-pressed="template.category === option"
          :disabled="savingCategory"
          @click="template.category !== option && pickCategory(option)"
        >
          <span class="category-option-badge" :style="{ '--tint': TEMPLATE_CATEGORY_TINTS[option] }">
            <CategoryIcon :category="option" />
          </span>
          <span>{{ SHORT_LABELS[option] }}</span>
        </button>
      </div>
    </div>

    <div class="section-label">
      <span>Exercises</span>
      <span class="aux">{{ templateExercises.length }}</span>
    </div>

    <p id="reorder-hint" class="sr-only">Use the up and down arrow keys to move this exercise.</p>
    <ol ref="listEl" class="ex-list" :class="{ 'is-dragging': drag }">
      <li
        v-for="(te, index) in templateExercises"
        :key="te.id"
        class="ex-card"
        :class="{ dragging: drag?.fromIndex === index }"
        :style="
          drag
            ? {
                transform:
                  `translateY(${cardOffset(index)}px)` + (drag.fromIndex === index ? ' rotate(-1.2deg) translateX(4px)' : ''),
              }
            : undefined
        "
      >
        <button
          type="button"
          class="grip"
          :data-grip-id="te.id"
          :aria-label="`Reorder ${exerciseName(te)}`"
          aria-describedby="reorder-hint"
          aria-keyshortcuts="ArrowUp ArrowDown"
          @keydown="handleGripKeydown($event, index)"
          @pointerdown="handleGripPointerDown($event, index)"
          @pointermove="handleGripPointerMove"
          @pointerup="handleGripPointerUp"
          @pointercancel="handleGripPointerCancel"
        >
          <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
            <circle cx="4" cy="4" r="1.6" />
            <circle cx="10" cy="4" r="1.6" />
            <circle cx="4" cy="9" r="1.6" />
            <circle cx="10" cy="9" r="1.6" />
            <circle cx="4" cy="14" r="1.6" />
            <circle cx="10" cy="14" r="1.6" />
          </svg>
        </button>
        <span class="ex-body">
          <span class="ex-name">{{ exerciseName(te) }}</span>
          <span v-if="isExerciseArchived(te.exercise_id)" class="archived-tag">Archived</span>
        </span>
        <span class="stepper">
          <button
            type="button"
            class="step-btn"
            :aria-label="`Fewer sets for ${exerciseName(te)}`"
            :disabled="te.target_sets === null || te.target_sets <= 1"
            @click="stepSets(te, -1)"
          >
            −
          </button>
          <span class="sets-value">
            <b>{{ te.target_sets ?? '–' }}</b>
            <small>sets</small>
          </span>
          <button
            type="button"
            class="step-btn"
            :aria-label="`More sets for ${exerciseName(te)}`"
            @click="stepSets(te, 1)"
          >
            +
          </button>
        </span>
        <button type="button" class="trash-btn" :aria-label="`Remove ${exerciseName(te)}`" @click="removeExercise(te, index)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </li>
      <li v-if="dropSlot" class="drop-slot" :style="dropSlot" aria-hidden="true"></li>
    </ol>
    <p v-if="templateExercises.length === 0" class="empty">No exercises yet.</p>

    <button type="button" class="add-exercise-btn" @click="openSheet">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      Add exercise
    </button>

    <div v-if="buildingProgram && templateExercises.length > 0" class="program-offer">
      <p class="program-offer-title">{{ template.name }} is saved</p>
      <p class="program-offer-copy">Add the other routines you do each week, or start training.</p>
      <div class="program-offer-actions">
        <button type="button" class="program-offer-more" @click="addAnotherRoutine">Add another routine</button>
        <button type="button" class="program-offer-done" @click="finishProgram">Done</button>
      </div>
    </div>

    <div
      v-if="nextRoutineOpen"
      class="next-routine-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="New routine"
      @click.self="nextRoutineOpen = false"
      @keydown.esc="nextRoutineOpen = false"
    >
      <form class="card next-routine-card" @submit.prevent="createNextRoutine">
        <h3 class="next-routine-title">New routine</h3>
        <label for="next-routine-name">Name</label>
        <input id="next-routine-name" v-model="nextRoutineName" type="text" placeholder="e.g. Pull Day" required autofocus />
        <p v-if="nextRoutineError" class="error">{{ nextRoutineError }}</p>
        <div class="next-routine-actions">
          <button type="submit" class="btn-accent next-routine-next">Next</button>
          <button type="button" class="ghost small" @click="nextRoutineOpen = false">Cancel</button>
        </div>
      </form>
    </div>

    <div v-if="removed" class="undo-toast" role="status">
      <span class="undo-text">Removed {{ removed.name }}</span>
      <button type="button" class="undo-btn" @click="undoRemove">Undo</button>
    </div>

    <AddExerciseSheet
      v-if="sheetOpen"
      :exercises="sheetExercises"
      :recent-ids="workout.recentlyLoggedExerciseIds"
      allow-create
      show-done
      add-label="Add to routine"
      :first-run="exercises.activeExercises.length === 0"
      :added="addedToTemplate"
      @select="handleSheetSelect"
      @dismiss="sheetOpen = false"
      @manage="handleSheetManage"
    />
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor.has-toast {
  padding-bottom: 64px;
}

.error {
  margin: 0;
  color: var(--danger);
}

.ed-head {
  display: flex;
  flex-direction: column;
}

/* .editor's gap already spaces the next section. */
.ed-head > .page-header {
  margin-bottom: 0;
}

.ed-name {
  flex-grow: 1;
  min-width: 0;
  margin: 0;
}

.ed-name-btn {
  max-width: 100%;
  min-height: 44px;
  padding: 0;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  font: inherit;
  text-align: left;
}

.ed-name-btn:active {
  transform: none;
}

.ed-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ed-name-btn svg {
  flex-shrink: 0;
  color: var(--text-dim);
}

.name-form {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.name-form input {
  flex: 1 1 100%;
  min-height: 44px;
}

.name-form .name-save {
  width: auto;
  flex: 1;
  min-height: 36px;
  margin-top: 0;
  font-size: 0.85rem;
}

.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.ghost.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.section-label {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 24px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.aux {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
  font-size: 0.8rem;
}

.aux-btn {
  min-height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 0.8rem;
  font-weight: 600;
}

.category-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.category-option {
  min-height: 0;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border-radius: 12px;
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
}

.category-option-badge {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--tint) 16%, transparent);
  color: var(--tint);
}

.category-option-badge .category-icon {
  width: 18px;
  height: 18px;
}

.category-option.auto {
  border-style: dashed;
  border-color: var(--text-dim);
}

.category-option.selected {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.category-option.selected .category-option-badge {
  background: rgba(255, 255, 255, 0.35);
  color: var(--accent-text);
}

.category-option:disabled {
  opacity: 1;
}

.ex-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ex-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 10px 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.ex-list.is-dragging .ex-card {
  transition: transform 150ms ease;
}

.ex-list.is-dragging .ex-card.dragging {
  z-index: 2;
  transition: none;
  border-color: var(--accent);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--shade) 45%, transparent);
}

.drop-slot {
  position: absolute;
  left: 0;
  right: 0;
  border: 1.5px dashed var(--border);
  border-radius: 14px;
  pointer-events: none;
}

.grip {
  flex-shrink: 0;
  width: 26px;
  min-height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
  opacity: 0.8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
}

.grip:active {
  transform: none;
  cursor: grabbing;
}

.ex-body {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.ex-name {
  max-width: 100%;
  font-weight: 600;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archived-tag {
  margin-top: 2px;
  padding: 0 6px;
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.stepper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
}

.step-btn {
  width: 32px;
  min-height: 34px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 1.05rem;
  font-weight: 700;
}

.step-btn:disabled {
  opacity: 0.35;
}

.sets-value {
  min-width: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}

.sets-value b {
  font-size: 0.85rem;
}

.sets-value small {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--text-dim);
}

.trash-btn {
  flex-shrink: 0;
  width: 34px;
  min-height: 34px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty {
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
}

.add-exercise-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1.5px dashed var(--border);
  border-radius: 14px;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
}

/* Issue #399: the setup wizard's program offer, and its name sheet (as on
   Home's welcome card). */
.program-offer {
  background: var(--surface);
  border: 1.5px solid var(--accent);
  border-radius: 16px;
  padding: 14px;
}

.program-offer-title {
  margin: 0;
  color: var(--text);
  font-weight: 800;
  font-size: 0.98rem;
  overflow-wrap: anywhere;
}

.program-offer-copy {
  margin: 4px 0 12px;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.program-offer-actions {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 10px;
}

.program-offer-actions button {
  margin: 0;
  padding: 12px 6px;
  white-space: nowrap;
  border-radius: 999px;
  font-weight: 800;
  font-size: 0.9rem;
}

.program-offer-more {
  background: transparent;
  border: 1.5px solid var(--accent);
  color: var(--accent);
}

.program-offer-done {
  background: var(--accent);
  border: 1.5px solid var(--accent);
  color: var(--accent-text);
}

.next-routine-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 16px;
}

.next-routine-card {
  width: 100%;
  max-width: 480px;
}

.next-routine-title {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: 1.2rem;
}

.next-routine-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.next-routine-next {
  flex: 1;
  margin-top: 0;
}

.undo-toast {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(var(--bottom-nav-height) + 12px + env(safe-area-inset-bottom, 0px));
  z-index: 20;
  max-width: 448px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 6px 6px 14px;
  border-radius: 14px;
  background: var(--border);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--shade) 40%, transparent);
  font-size: 0.88rem;
}

.undo-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.undo-btn {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: var(--accent);
  font-weight: 700;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
