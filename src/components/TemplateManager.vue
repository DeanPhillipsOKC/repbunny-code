<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExercisesStore } from '../stores/exercises'
import { useTemplatesStore } from '../stores/templates'
import { useWorkoutsStore } from '../stores/workouts'
import {
  FREE_TEMPLATE_LIMIT,
  claimLastTemplateHint,
  lastTemplateHintOpen,
  openPremiumSheet,
  showPremiumNudges,
} from '../lib/premium'
import { TEMPLATE_CATEGORY_LABELS, TEMPLATE_CATEGORY_TINTS } from '../lib/templateCategory'
import CategoryIcon from './CategoryIcon.vue'
import LastTemplateHint from './LastTemplateHint.vue'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'
import StarterPrograms from './StarterPrograms.vue'

const route = useRoute()
const router = useRouter()
const exercises = useExercisesStore()
const templates = useTemplatesStore()
const workouts = useWorkoutsStore()

const name = ref('')
const errorMessage = ref('')

// Backlog item 54: the create form used to be a permanent card pinned above
// the list, eating space on every visit even though adding a template is
// rare compared to browsing/logging against existing ones. It now opens
// on demand as a dialog, same "sheet with a backdrop" shape as
// RecordCelebration.vue's overlay.
const showAddForm = ref(false)

// Issue #104: past the free template limit this opens the Premium sheet.
async function openAddForm() {
  if (!(await templates.canCreateTemplate())) {
    openPremiumSheet('templates')
    return
  }
  errorMessage.value = ''
  name.value = ''
  showAddForm.value = true
}

function closeAddForm() {
  showAddForm.value = false
}

function handleAddFormKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showAddForm.value) closeAddForm()
}

onMounted(() => document.addEventListener('keydown', handleAddFormKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleAddFormKeydown))

// Backlog item 35: id of the row showing its "are you sure" archive confirm
// — null means none. Same inline-toggle pattern as WorkoutHistory.vue's
// delete confirm. Issue #495 added the way back (Archived routines below).
const confirmingArchiveId = ref<string | null>(null)

async function confirmArchive(templateId: string) {
  errorMessage.value = ''
  const { error } = await templates.archiveTemplate(templateId)
  if (error) {
    errorMessage.value = error.message
  }
  confirmingArchiveId.value = null
}

// Issue #495: archived routines live in a quiet list below; Restore clears the
// flag, or opens the Premium sheet when the free routine limit is full.
async function handleRestore(templateId: string) {
  errorMessage.value = ''
  if (!(await templates.canCreateTemplate())) {
    openPremiumSheet('templates')
    return
  }
  const { error } = await templates.restoreTemplate(templateId)
  if (error) errorMessage.value = error.message
}

onMounted(() => {
  templates.fetchTemplates()
  if (exercises.exercises.length === 0) exercises.fetchExercises()
  // Issue #114: the last-free-template hint shows here once the user is back
  // from the editor of the template that used up the free ones.
  claimLastTemplateHint(!!workouts.activeWorkoutId)
})

// Issue #6: naming a template leads straight into its editor, with the Add
// exercise sheet already open (TemplateEditor.vue reads `add`).
async function handleCreate() {
  errorMessage.value = ''
  const { data, error } = await templates.createTemplate(name.value)
  if (error || !data) {
    errorMessage.value = error?.message ?? 'Could not create routine.'
    return
  }
  name.value = ''
  showAddForm.value = false
  router.push({ name: 'template-edit', params: { id: data.id }, query: { add: '1' } })
}

// Issue #207: Home's "Start from a program" lands here, scrolled to the
// starter programs with the first one briefly highlighted.
const highlightPrograms = route.query.programs === '1'
onMounted(async () => {
  if (!highlightPrograms) return
  router.replace({ query: {} })
  await nextTick()
  document.getElementById('starter-heading')?.scrollIntoView({ block: 'start' })
})

// Issue #148: after a starter program adds its templates.
const addedProgram = ref('')
// Issue #418: from first run (Routines opened with ?programs=1) Add goes
// straight to Home, which says what happened and highlights the first routine.
function handleProgramAdded(names: string[], firstTemplateId: string | undefined, programName: string) {
  addedProgram.value = names.join(', ')
  if (highlightPrograms && firstTemplateId) {
    templates.programWelcome = { programName, firstTemplateId }
    router.push({ name: 'home' })
  }
}

function openEditor(templateId: string) {
  router.push({ name: 'template-edit', params: { id: templateId } })
}

// Backlog item 75: workout_template_exercises(count) is a cached aggregate
// fetched once by fetchTemplates() and never updated by
// addExerciseToTemplate/removeExerciseFromTemplate, so it goes stale as soon
// as either mutates a template whose exercises the editor has loaded this
// session. exercisesByTemplate is kept live by both, so prefer its length
// once the editor has populated it; fall back to the cached count for a
// template that hasn't been opened yet.
function exerciseCount(template: { id: string; workout_template_exercises?: { count: number }[] }): number {
  const live = templates.exercisesByTemplate[template.id]
  if (live) return live.length
  return template.workout_template_exercises?.[0]?.count ?? 0
}
</script>

<template>
  <div>
    <PageHeader title="Routines" />

    <button v-if="!showAddForm" type="button" class="add-template-trigger" @click="openAddForm">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      Add routine
    </button>
    <!-- Issue #114: a quiet count of the free routines (local mode, no Premium). -->
    <p v-if="showPremiumNudges && !templates.loading" class="free-count">
      {{ templates.activeTemplates.length }} of {{ FREE_TEMPLATE_LIMIT }} free routines
    </p>
    <LastTemplateHint v-if="lastTemplateHintOpen && showPremiumNudges" class="last-hint" />

    <div v-if="showAddForm" class="sheet-overlay" role="dialog" aria-modal="true" aria-label="New routine" @click.self="closeAddForm">
      <form class="card sheet-card" @submit.prevent="handleCreate">
        <h3 class="sheet-title">New routine</h3>
        <label for="template-name">Name</label>
        <input id="template-name" v-model="name" type="text" placeholder="e.g. Push Day" required autofocus />
        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        <div class="sheet-actions">
          <button type="submit">Next</button>
          <button type="button" class="ghost small" @click="closeAddForm">Cancel</button>
        </div>
      </form>
    </div>

    <p v-if="!showAddForm && errorMessage" class="error">{{ errorMessage }}</p>
    <SkeletonRows v-if="templates.loading" :rows="3" />

    <ul v-else class="list">
      <li v-for="template in templates.activeTemplates" :key="template.id" class="row-wrap">
        <div v-if="confirmingArchiveId !== template.id" class="row" @click="openEditor(template.id)">
          <span
            class="template-icon"
            :data-category="templates.categoryOf(template)"
            :style="{
              background: `color-mix(in srgb, ${TEMPLATE_CATEGORY_TINTS[templates.categoryOf(template)]} 16%, transparent)`,
              color: TEMPLATE_CATEGORY_TINTS[templates.categoryOf(template)],
            }"
          >
            <CategoryIcon :category="templates.categoryOf(template)" />
          </span>
          <span class="row-body">
            <span class="row-title">{{ template.name }}</span>
            <span class="row-sub">
              {{ exerciseCount(template) }} exercise{{ exerciseCount(template) === 1 ? '' : 's' }} ·
              {{ TEMPLATE_CATEGORY_LABELS[templates.categoryOf(template)] }}
            </span>
          </span>
          <button
            type="button"
            class="archive-icon-btn"
            aria-label="Archive routine"
            @click.stop="confirmingArchiveId = template.id"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
              <rect x="4" y="5" width="16" height="4" rx="1.3" stroke="currentColor" stroke-width="1.7" />
              <path
                d="M5.5 9.5V17a1.6 1.6 0 001.6 1.6h9.8A1.6 1.6 0 0018.5 17V9.5"
                stroke="currentColor"
                stroke-width="1.7"
              />
              <path d="M10 13h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
          </button>
          <svg class="row-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div v-else class="row confirm-archive">
          <span class="row-sub">Archive this routine? You can restore it from Archived routines.</span>
          <div class="confirm-actions">
            <button type="button" class="danger small" @click="confirmArchive(template.id)">Confirm archive</button>
            <button type="button" class="ghost small" @click="confirmingArchiveId = null">Cancel</button>
          </div>
        </div>
      </li>
    </ul>
    <p v-if="!templates.loading && templates.activeTemplates.length === 0" class="empty">
      No routines yet. Add one above, or start from a program below.
    </p>
    <p v-if="addedProgram" class="added" role="status">Added {{ addedProgram }}. Tap one to change it.</p>

    <section v-if="!templates.loading && templates.archivedTemplates.length" class="archived" aria-labelledby="archived-heading">
      <h3 id="archived-heading" class="archived-heading">Archived routines</h3>
      <ul class="list">
        <li v-for="template in templates.archivedTemplates" :key="template.id" class="row-wrap">
          <div class="row archived-row">
            <span class="row-body">
              <span class="row-title">{{ template.name }}</span>
              <span class="row-sub">
                {{ exerciseCount(template) }} exercise{{ exerciseCount(template) === 1 ? '' : 's' }}
              </span>
            </span>
            <button
              type="button"
              class="ghost small"
              :aria-label="`Restore ${template.name}`"
              @click="handleRestore(template.id)"
            >
              Restore
            </button>
          </div>
        </li>
      </ul>
    </section>

    <StarterPrograms :highlight="highlightPrograms" @added="handleProgramAdded" />
  </div>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 20px;
}

.error {
  color: var(--danger);
}

.add-template-trigger {
  width: 100%;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.add-template-trigger:has(+ .free-count) {
  margin-bottom: 8px;
}

.free-count {
  margin: 0 0 16px;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.last-hint {
  margin-bottom: 16px;
}

.add-template-trigger:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 16px;
}

.sheet-card {
  width: 100%;
  max-width: 480px;
  margin-bottom: 20px;
}

.sheet-title {
  margin: 0 0 12px;
  font-family: var(--font-display);
  font-size: 1.2rem;
}

.sheet-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.sheet-actions button[type='submit'] {
  margin-top: 0;
}

.sheet-actions .ghost {
  flex-shrink: 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
}

.row-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.template-icon {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.template-icon .category-icon {
  width: 34px;
  height: 34px;
}

.archive-icon-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  min-height: 0;
  padding: 0;
  border-radius: 11px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.row-chevron {
  flex-shrink: 0;
  margin-left: -4px;
  color: var(--text-dim);
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

.archived {
  margin-top: 24px;
}

.archived-heading {
  margin: 0 0 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-dim);
}

.archived-row {
  cursor: default;
}

.confirm-archive {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  cursor: default;
}

.confirm-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--accent-text);
}

.danger.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.row-body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
}

.empty {
  text-align: center;
  padding: 12px 0;
}

.added {
  margin: 12px 0 0;
  font-size: 0.85rem;
  color: var(--success);
}
</style>
