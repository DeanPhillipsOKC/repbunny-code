<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { autoCopy, chooseBackupFolder, ensureAutoCopy, turnOffAutoCopy, useDefaultFolder } from '../lib/backupFolder'
import AutoCopyOffConfirm from './AutoCopyOffConfirm.vue'

// Issue #874 (design docs/design/issue-874-automatic-copy.html, A to C): the
// setup wizard's automatic copy step (SetupWizard.vue has the heading). It's
// information, not a choice: the copy is already on, and Next moves on. The
// quiet links change the folder, or turn the copy off behind the warning.
const ready = ref(false)
const busy = ref(false)
const error = ref('')
const confirmOff = ref(false)

onMounted(async () => {
  await ensureAutoCopy()
  ready.value = true
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
  <div v-if="ready" class="copy-step" data-testid="setup-copy">
    <template v-if="autoCopy.status === 'off'">
      <p class="lede">The automatic copy is off. Everything is stored only on this phone, so a lost phone means lost workouts.</p>
      <button type="button" class="turn-on" :disabled="busy" @click="run(useDefaultFolder)">Keep a copy</button>
    </template>
    <template v-else>
      <p class="lede">
        RepBunny saves a copy of your workouts to <b>{{ autoCopy.name }}</b> after every workout, so a lost phone doesn't mean lost
        workouts.
      </p>
      <div class="folder" :class="{ local: autoCopy.local }">
        <span class="folder-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path v-if="autoCopy.local" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path v-else d="M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" />
          </svg>
        </span>
        <span class="folder-text">
          <span class="folder-name">{{ autoCopy.name }}</span>
          <span class="folder-caption">{{ autoCopy.local ? 'On this phone' : 'Safe even if you lose this phone' }}</span>
        </span>
      </div>
      <p v-if="autoCopy.local" class="warn" data-testid="setup-copy-local">
        This copy stays on this phone. Pick a cloud folder in Account › Your data to protect against losing it.
      </p>
      <ul v-else class="facts">
        <li><span class="tick" aria-hidden="true">✓</span>Nothing to set up. It just happens.</li>
        <li><span class="tick" aria-hidden="true">✓</span>It goes to your own storage, never to us.</li>
        <li><span class="tick" aria-hidden="true">✓</span>On a new phone, RepBunny finds it for you.</li>
      </ul>
      <div class="quiet">
        <button type="button" :disabled="busy" @click="run(chooseBackupFolder)">Change folder</button>
        <button type="button" :disabled="busy" @click="confirmOff = true">Don't keep a copy</button>
      </div>
    </template>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <AutoCopyOffConfirm v-if="confirmOff" @keep="confirmOff = false" @off="turnOff" />
  </div>
</template>

<style scoped>
.copy-step {
  display: flex;
  flex-direction: column;
}

.lede {
  margin: 0 0 16px;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.lede b {
  color: var(--text);
}

.folder {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--success) 45%, transparent);
  border-radius: 16px;
  background: var(--surface);
  --c: var(--success);
}

.folder.local {
  border-color: color-mix(in srgb, var(--highlight) 45%, transparent);
  --c: var(--highlight);
}

.folder-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--c) 18%, transparent);
  color: var(--c);
}

.folder-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.folder-name {
  font-weight: 800;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.folder-caption {
  font-size: 0.82rem;
  color: var(--text-dim);
}

.facts {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 0.88rem;
  color: var(--text-dim);
}

.facts li {
  display: flex;
  gap: 10px;
}

.tick {
  color: var(--success);
  font-weight: 800;
}

.warn {
  margin: 14px 0 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--highlight) 10%, var(--surface));
  font-size: 0.85rem;
  line-height: 1.45;
}

.quiet {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 22px;
  margin-top: 14px;
}

.quiet button {
  min-height: 44px;
  padding: 0 4px;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 800;
}

.turn-on {
  min-height: 48px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-weight: 800;
}

.error {
  margin: 12px 0 0;
  font-size: 0.84rem;
  color: var(--danger);
}
</style>
