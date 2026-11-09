<script setup lang="ts">
import { openBugReport } from '../lib/accountSheet'
import { reportPrompt } from '../lib/errorLog'

// Issue #234: after an error the user would notice (src/lib/errorLog.ts's
// offerReport), a small note offers a one-tap bug report. Pinned under the
// status bar and never a modal, so it can't cover the set inputs or the
// bottom dock mid-workout. Send report opens Report a bug with this error
// checked; nothing leaves the phone until the user sends the email.
function send() {
  const error = reportPrompt.value
  reportPrompt.value = null
  if (error) openBugReport(error)
}

function dismiss() {
  reportPrompt.value = null
}
</script>

<template>
  <div v-if="reportPrompt" class="report-prompt" role="region" aria-label="Something went wrong">
    <span class="prompt-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 8v5M12 16.5v.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    </span>
    <div class="prompt-text">
      <p class="prompt-title">Something went wrong. Send a report?</p>
      <p class="prompt-body">You'll see everything in it first.</p>
      <div class="prompt-actions">
        <button type="button" class="prompt-send" @click="send">Send report</button>
        <button type="button" class="prompt-later" @click="dismiss">Not now</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-prompt {
  position: fixed;
  top: calc(var(--safe-top, 0px) + 8px);
  left: 12px;
  right: 12px;
  z-index: 40;
  max-width: 456px;
  margin: 0 auto;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.prompt-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9px;
  background: color-mix(in srgb, var(--danger) 20%, transparent);
  color: var(--danger);
  display: flex;
  align-items: center;
  justify-content: center;
}

.prompt-text {
  flex: 1;
  min-width: 0;
}

.prompt-title {
  margin: 0;
  font-weight: 800;
  font-size: 0.9rem;
  color: var(--text);
}

.prompt-body {
  margin: 2px 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.prompt-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.prompt-send,
.prompt-later {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 0.86rem;
  font-weight: 800;
}

.prompt-send {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: var(--accent-text);
}

.prompt-later {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
}
</style>
