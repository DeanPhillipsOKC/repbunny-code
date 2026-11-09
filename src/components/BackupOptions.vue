<script setup lang="ts">
import { computed, ref } from 'vue'
import { BACKUP_PARTS, type BackupPart } from '../lib/backup'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #93: "Back up my data" asks what goes in the file first. All three
// start on, which writes the same full backup as before; anything less makes
// a partial file that merges in on restore (e.g. sharing templates with a
// friend without your history). Rendered by AccountSheet.vue in its overlay.
defineProps<{ busy: boolean }>()
const emit = defineEmits<{ cancel: []; save: [includes: BackupPart[]] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('cancel'))

const tiles: { part: BackupPart; title: string; caption: string }[] = [
  { part: 'preferences', title: 'Account preferences', caption: 'Weight unit, rest timer, height, reminders, and plates' },
  { part: 'templates', title: 'Routines & exercises', caption: 'Every exercise with its setup notes, and your routines' },
  { part: 'history', title: 'Workout history', caption: 'Workouts, sets, and your body-weight log' },
]

const picked = ref<Record<BackupPart, boolean>>({ preferences: true, templates: true, history: true })
const includes = computed(() => BACKUP_PARTS.filter((part) => picked.value[part]))
const isFull = computed(() => includes.value.length === BACKUP_PARTS.length)
const note = computed(() => {
  if (includes.value.length === 0) return 'Pick at least one.'
  if (isFull.value) return 'A full backup. Restoring it replaces everything.'
  const exercises = picked.value.history && !picked.value.templates ? ' The exercises your sets use come along.' : ''
  return `Restoring this adds to what's there. Nothing is deleted.${exercises}`
})
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="What to back up">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <h3 class="sheet-title">What to back up</h3>
      <button type="button" class="sheet-close" aria-label="Close" :disabled="busy" @click="emit('cancel')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="tiles">
      <label v-for="tile in tiles" :key="tile.part" class="tile" :class="{ on: picked[tile.part] }">
        <input v-model="picked[tile.part]" type="checkbox" class="tile-input" />
        <span class="tile-check" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7"></path>
          </svg>
        </span>
        <span class="tile-text">
          <span class="tile-title">{{ tile.title }}</span>
          <span class="tile-caption">{{ tile.caption }}</span>
        </span>
      </label>
    </div>

    <p class="note">{{ note }}</p>

    <button type="button" class="save-button" :disabled="includes.length === 0 || busy" @click="emit('save', includes)">
      {{ busy ? 'Saving…' : 'Save backup' }}
    </button>
    <button type="button" class="ghost" :disabled="busy" @click="emit('cancel')">Cancel</button>
  </div>
</template>

<style scoped>
.sheet {
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
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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

.tiles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tile {
  position: relative;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}

.tile.on {
  border-color: color-mix(in srgb, var(--secondary) 60%, var(--border));
  background: color-mix(in srgb, var(--secondary) 8%, var(--surface));
}

.tile-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
}

.tile:has(.tile-input:focus-visible) {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.tile-check {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 7px;
  border: 1.5px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
}

.tile.on .tile-check {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--accent-text);
}

.tile-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tile-title {
  font-weight: 800;
  color: var(--text);
}

.tile-caption {
  margin-top: 2px;
  font-size: 0.76rem;
  line-height: 1.35;
  color: var(--text-dim);
}

.note {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.save-button {
  width: 100%;
  min-height: 50px;
  border-radius: 14px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.save-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ghost {
  width: 100%;
  min-height: 50px;
  border-radius: 14px;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
  font-weight: 800;
}
</style>
