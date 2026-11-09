<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  autoCopy,
  chooseBackupFolder,
  refreshAutoCopy,
  saveAutoCopy,
  turnOffAutoCopy,
  useDefaultFolder,
} from '../lib/backupFolder'
import { useEscapeClose } from '../lib/escapeClose'
import AutoCopyOffConfirm from './AutoCopyOffConfirm.vue'

// Issue #432: Account > Your data > Automatic copy (native only). Shows where
// the copy goes and when it last saved, and lets the person change the
// folder. The copy itself saves after every finished workout
// (lib/backupFolder.ts). Issue #874: it's on by default in a folder the app
// picks; turning it off needs the warning (AutoCopyOffConfirm.vue), and Turn
// it on brings it back.
const emit = defineEmits<{ back: []; dismiss: [] }>()

const confirmOff = ref(false)

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('back'))

const busy = ref(false)
const error = ref('')

onMounted(() => void refreshAutoCopy())

function when(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === today.toDateString()) return `today at ${time}`
  if (date.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const statusLine = computed(() => {
  const state = autoCopy.value
  if (state.status === 'off') return 'Off'
  if (state.status === 'unreachable') return `Can't reach ${state.name}`
  return state.lastSavedAt ? `Saving to ${state.name}, last saved ${when(state.lastSavedAt)}` : `Saving to ${state.name}`
})

async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function turnOff() {
  confirmOff.value = false
  void run(turnOffAutoCopy)
}
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Automatic copy">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <button type="button" class="sheet-icon" aria-label="Back" @click="emit('back')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <h3 class="sheet-title">Automatic copy</h3>
      <button type="button" class="sheet-icon" aria-label="Close" @click="emit('dismiss')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
    <p class="lede">
      After every workout RepBunny saves a copy of your data, plus a dated copy once a week (it keeps the last 4). It goes to your own
      storage, never to us.
    </p>

    <div class="status" :class="`status-${autoCopy.status}`" data-testid="auto-copy-status" role="status">
      <span class="status-title">{{ statusLine }}</span>
      <span v-if="autoCopy.status === 'unreachable'" class="status-caption">
        The folder was moved or deleted, or RepBunny lost access to it. Pick it again, or choose another one.
      </span>
      <span v-else-if="autoCopy.status === 'on' && autoCopy.local" class="status-caption">
        This folder is only on this phone. It protects you from app problems, but not from losing your phone. Choose a cloud folder to
        protect against that.
      </span>
      <span v-else-if="autoCopy.status === 'on'" class="status-caption">Safe even if you lose this phone.</span>
      <span v-else class="status-caption">
        Everything is stored only on this phone. If it's lost, reset, or the app is deleted, your workouts are gone for good.
      </span>
      <span v-if="autoCopy.status !== 'off' && autoCopy.kept" class="status-caption" data-testid="auto-copy-kept">
        The copy already in this folder was kept as {{ autoCopy.kept }}.
      </span>
    </div>

    <div class="actions">
      <template v-if="autoCopy.status === 'off'">
        <button type="button" class="btn-accent action" :disabled="busy" @click="run(useDefaultFolder)">Turn it on</button>
        <button type="button" class="action action-quiet" :disabled="busy" @click="run(chooseBackupFolder)">Choose a folder</button>
      </template>
      <template v-else>
        <button type="button" class="btn-accent action" :disabled="busy" @click="run(chooseBackupFolder)">Change folder</button>
        <button v-if="!autoCopy.auto" type="button" class="action action-quiet" :disabled="busy" @click="run(useDefaultFolder)">
          Use RepBunny's folder
        </button>
        <button type="button" class="action action-quiet" :disabled="busy" @click="run(() => saveAutoCopy())">Save a copy now</button>
        <button type="button" class="action action-quiet action-off" :disabled="busy" @click="confirmOff = true">Turn it off</button>
      </template>
    </div>
    <p v-if="autoCopy.status !== 'off'" class="lede">
      On a new phone, install RepBunny and it offers these copies on its welcome screen. Your copies, in Your data, lists them any time.
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <AutoCopyOffConfirm v-if="confirmOff" @keep="confirmOff = false" @off="turnOff" />
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

.lede {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.status-on {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
}

.status-unreachable {
  border-color: color-mix(in srgb, var(--danger) 45%, transparent);
}

.status-title {
  font-weight: 700;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.status-caption {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action {
  width: 100%;
  min-height: 48px;
}

.action-quiet {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}

.action-off {
  color: var(--danger);
}

.error {
  margin: 0;
  font-size: 0.84rem;
  color: var(--danger);
}
</style>
