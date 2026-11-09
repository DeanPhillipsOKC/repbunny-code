<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { BackupFile } from '../lib/backup'
import { listRestorePoints, loadRestorePoint, type RestorePointSummary } from '../lib/restorePoints'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #430: Account > Your data > Restore points (local mode only). Lists
// the copies the app saved on its own (before an update, after each workout,
// before a restore), newest first. Picking one hands it to the usual restore
// preview (RestoreBackup.vue), typed RESTORE and all.
// Issue #431: the recovery screen (RecoveryScreen.vue) restores the pick
// straight away, with `restoreNow`, since there's no data left to compare.
defineProps<{ restoreNow?: boolean }>()
const emit = defineEmits<{ back: []; dismiss: []; pick: [name: string, backup: BackupFile] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('back'))

const points = ref<RestorePointSummary[] | null>(null)
const error = ref('')
const opening = ref('')

onMounted(async () => {
  try {
    points.value = await listRestorePoints()
  } catch (e) {
    points.value = []
    error.value = `Couldn't read restore points. ${e instanceof Error ? e.message : String(e)}`
  }
})

function when(iso: string) {
  const date = new Date(iso)
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${day} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

function workoutCount(n: number) {
  return `${n} workout${n === 1 ? '' : 's'}`
}

async function open(point: RestorePointSummary) {
  if (opening.value) return
  opening.value = point.id
  error.value = ''
  try {
    const backup = await loadRestorePoint(point.id)
    if (!backup) throw new Error('It may have just been replaced by a newer one.')
    emit('pick', `${point.label} · ${when(point.created_at)}`, backup)
  } catch (e) {
    error.value = `Couldn't open that restore point. ${e instanceof Error ? e.message : String(e)}`
  } finally {
    opening.value = ''
  }
}
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Restore points">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <button type="button" class="sheet-icon" aria-label="Back" @click="emit('back')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <h3 class="sheet-title">Restore points</h3>
      <button type="button" class="sheet-icon" aria-label="Close" @click="emit('dismiss')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
    <p v-if="restoreNow" class="lede">Pick the one to bring back. Anything logged after it isn't in it.</p>
    <p v-else class="lede">
      RepBunny saves a copy of your data on this phone before each update and after every workout, and keeps the
      last 10. Pick one to see what's in it before anything changes.
    </p>

    <p v-if="points === null" class="empty">Loading…</p>
    <p v-else-if="points.length === 0 && !error" class="empty">
      No restore points yet. The first one is saved when you finish a workout.
    </p>
    <ul v-else class="points" aria-label="Saved restore points">
      <li v-for="point in points" :key="point.id">
        <button type="button" class="point" :disabled="!!opening" @click="open(point)">
          <span class="point-text">
            <span class="point-title">{{ point.label }}</span>
            <span class="point-caption">{{ when(point.created_at) }} · {{ workoutCount(point.workouts) }}</span>
          </span>
          <span class="point-chevron" aria-hidden="true">{{ opening === point.id ? '…' : '›' }}</span>
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
