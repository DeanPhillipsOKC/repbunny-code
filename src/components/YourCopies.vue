<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { BackupFile } from '../lib/backup'
import { autoCopy, COPY_LABELS, listCopies, loadCopy, type CopySummary } from '../lib/backupFolder'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #874 (design docs/design/issue-874-automatic-copy.html, F): Account >
// Your data > Your copies (native only), built like Restore points
// (RestorePoints.vue). Lists the automatic copies in the folder: the latest,
// the weekly ones, and any kept one, with date and workout count. Picking one
// hands it to the usual restore preview (RestoreBackup.vue). Setup's welcome
// opens it too, with `setup`, on a new install.
defineProps<{ setup?: boolean }>()
const emit = defineEmits<{ back: []; dismiss: []; pick: [name: string, backup: BackupFile] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('back'))

const copies = ref<CopySummary[] | null>(null)
const error = ref('')
const opening = ref('')

onMounted(async () => {
  try {
    copies.value = await listCopies()
  } catch (e) {
    copies.value = []
    error.value = `Couldn't read your copies. ${e instanceof Error ? e.message : String(e)}`
  }
})

function when(copy: CopySummary) {
  const date = new Date(copy.exportedAt)
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (copy.kind !== 'latest') return day
  return `${day} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

function workoutCount(n: number) {
  return `${n} workout${n === 1 ? '' : 's'}`
}

async function open(copy: CopySummary) {
  if (opening.value) return
  opening.value = copy.file
  error.value = ''
  try {
    const backup = await loadCopy(copy.file)
    if (!backup) throw new Error("It isn't a RepBunny backup anymore.")
    emit('pick', `${COPY_LABELS[copy.kind]} · ${when(copy)}`, backup)
  } catch (e) {
    error.value = `Couldn't open that copy. ${e instanceof Error ? e.message : String(e)}`
  } finally {
    opening.value = ''
  }
}
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Your copies">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <button type="button" class="sheet-icon" aria-label="Back" @click="emit('back')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <h3 class="sheet-title">Your copies</h3>
      <button type="button" class="sheet-icon" aria-label="Close" @click="emit('dismiss')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
    <p v-if="setup" class="lede">Pick the one to bring back. You'll see what's in it before anything changes.</p>
    <p v-else class="lede" data-testid="your-copies-lede">
      Saved to <b>{{ autoCopy.status === 'off' ? 'your folder' : autoCopy.name }}</b> after every workout, plus one a week. Pick one to
      see what's in it before anything changes.
    </p>

    <p v-if="copies === null" class="empty">Loading…</p>
    <p v-else-if="copies.length === 0 && !error" class="empty">
      {{ setup ? 'No RepBunny copies in that folder.' : 'No copies yet. The first one is saved when you finish a workout.' }}
    </p>
    <ul v-else class="points" aria-label="Saved copies">
      <li v-for="copy in copies" :key="copy.file">
        <button type="button" class="point" :disabled="!!opening" @click="open(copy)">
          <span class="point-text">
            <span class="point-title">{{ COPY_LABELS[copy.kind] }}</span>
            <span class="point-caption">{{ when(copy) }} · {{ workoutCount(copy.workouts) }}</span>
          </span>
          <span class="point-chevron" aria-hidden="true">{{ opening === copy.file ? '…' : '›' }}</span>
        </button>
      </li>
    </ul>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.sheet {
  position: relative;
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet-handle {
  align-self: center;
  flex-shrink: 0;
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
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.sheet-icon {
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

.lede b {
  color: var(--text);
  overflow-wrap: anywhere;
}

.lede,
.empty {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.points {
  list-style: none;
  margin: 0;
  padding: 0;
  flex-shrink: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.points li + li {
  border-top: 1px solid var(--border);
}

.point {
  width: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: transparent;
  border: none;
  border-radius: 0;
  text-align: left;
  color: var(--text);
}

.point:active {
  transform: none;
  background: var(--surface-2);
}

.point:disabled {
  opacity: 0.55;
}

.point-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.point-title {
  font-weight: 700;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.point-caption {
  margin-top: 1px;
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-dim);
}

.point-chevron {
  margin-left: auto;
  color: var(--text-dim);
  font-size: 1.1rem;
}

.error {
  margin: 0;
  font-size: 0.84rem;
  color: var(--danger);
}
</style>
