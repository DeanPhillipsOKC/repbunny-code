<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { parseBackup, type BackupFile } from '../lib/backup'
import {
  autoCopy,
  backupFolderAvailable,
  chooseBackupFolder,
  ensureAutoCopy,
  listCopies,
  loadCopy,
  type CopySummary,
} from '../lib/backupFolder'
import RestoreBackup from './RestoreBackup.vue'
import YourCopies from './YourCopies.vue'

// The setup wizard's welcome-screen restores (SetupWizard.vue puts its own
// buttons in the slot, between the offer and the links).
// #431: "Restoring from a backup?" covers a reinstall, where no restore points
// are left. It opens the usual file restore (the preview, typed RESTORE and
// all), and a restore that works skips the rest of setup.
// #874 (design docs/design/issue-874-automatic-copy.html, D and E): on a new
// install whose folder already holds automatic copies (iCloud Drive keeps
// them through a deleted app or a new iPhone), the welcome offers the latest
// one. Otherwise "Find my copies" opens the folder picker (Android's new
// install can't see the old one's files until the person points at them),
// keeps that folder for the copy, and lists what's in it.
defineProps<{ busy: boolean }>()
const emit = defineEmits<{ restored: [] }>()

const latest = ref<CopySummary | null>(null)
const copiesOpen = ref(false)
const restoreInput = ref<HTMLInputElement | null>(null)
const pickedBackup = ref<{ name: string; backup: BackupFile } | null>(null)
const restoreError = ref('')
const working = ref(false)

onMounted(async () => {
  if (!backupFolderAvailable) return
  await ensureAutoCopy()
  try {
    latest.value = (await listCopies())[0] ?? null
  } catch {
    // No folder to read yet: Find my copies still works.
  }
})

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

async function restoreLatest() {
  if (!latest.value || working.value) return
  working.value = true
  restoreError.value = ''
  try {
    const backup = await loadCopy(latest.value.file)
    if (!backup) throw new Error("It isn't a RepBunny backup anymore.")
    pickedBackup.value = { name: `Latest copy · ${when(latest.value.exportedAt)}`, backup }
  } catch (e) {
    restoreError.value = `Couldn't open your copy. ${e instanceof Error ? e.message : String(e)}`
  } finally {
    working.value = false
  }
}

async function findCopies() {
  if (working.value) return
  working.value = true
  restoreError.value = ''
  try {
    if (await chooseBackupFolder()) copiesOpen.value = true
  } catch (e) {
    restoreError.value = e instanceof Error ? e.message : String(e)
  } finally {
    working.value = false
  }
}

function pickCopy(name: string, backup: BackupFile) {
  copiesOpen.value = false
  pickedBackup.value = { name, backup }
}

function pickBackupFile() {
  restoreError.value = ''
  restoreInput.value?.click()
}

async function handleBackupPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const backup = parseBackup(await file.text())
  if (!backup) {
    restoreError.value = "This isn't a RepBunny backup file."
    return
  }
  pickedBackup.value = { name: file.name, backup }
}

function backupRestored() {
  pickedBackup.value = null
  emit('restored')
}
</script>

<template>
  <section v-if="latest" class="offer" data-testid="setup-copy-offer" aria-labelledby="setup-copy-offer-title">
    <h2 id="setup-copy-offer-title" class="offer-title">Restore your workouts from {{ when(latest.exportedAt) }}?</h2>
    <p class="offer-text">
      RepBunny found your copy in {{ autoCopy.status === 'off' ? 'your folder' : autoCopy.name }}.
      {{ latest.workouts }} workout{{ latest.workouts === 1 ? '' : 's' }}.
    </p>
    <button type="button" class="offer-restore" :disabled="busy || working" @click="restoreLatest">Restore my workouts</button>
    <button type="button" class="link" :disabled="busy || working" @click="copiesOpen = true">See all copies</button>
  </section>

  <slot />

  <p v-if="restoreError" class="error" role="alert">{{ restoreError }}</p>
  <button v-if="backupFolderAvailable && !latest" type="button" class="link" :disabled="busy || working" @click="findCopies">
    Had RepBunny before? Find my copies
  </button>
  <button type="button" class="link" :disabled="busy || working" @click="pickBackupFile">Restoring from a backup?</button>
  <input
    ref="restoreInput"
    type="file"
    accept=".json,application/json"
    class="file-input"
    aria-label="Backup file"
    tabindex="-1"
    @change="handleBackupPicked"
  />

  <div v-if="copiesOpen || pickedBackup" class="restore-overlay">
    <RestoreBackup
      v-if="pickedBackup"
      :file-name="pickedBackup.name"
      :backup="pickedBackup.backup"
      @cancel="pickedBackup = null"
      @done="backupRestored"
    />
    <YourCopies v-else setup @back="copiesOpen = false" @dismiss="copiesOpen = false" @pick="pickCopy" />
  </div>
</template>

<style scoped>
.offer,
.link,
.error {
  width: 100%;
  max-width: 440px;
}

.offer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--secondary) 45%, transparent);
  border-radius: 20px;
  background: var(--surface);
}

.offer-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.15;
  text-transform: none;
  letter-spacing: normal;
  color: var(--text);
}

.offer-text {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.4;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.offer-restore {
  min-height: 48px;
  border: none;
  border-radius: 14px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.link {
  background: none;
  border: none;
  min-height: 44px;
  color: var(--accent);
  font-weight: 800;
  font-size: 0.86rem;
  padding: 4px 0 0;
}

.file-input {
  display: none;
}

.restore-overlay {
  position: fixed;
  inset: 0;
  z-index: 61;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.error {
  color: var(--danger);
  font-size: 0.85rem;
  text-align: center;
  margin: 0 0 10px;
}
</style>
