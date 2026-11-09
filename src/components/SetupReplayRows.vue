<script setup lang="ts">
import { setupWizardMode } from '../lib/setupWizard'
import './account-rows.css'

// Preferences' "Run setup again" row (issue #397): reopens the setup wizard
// with today's values. The wizard is full screen, so the Account sheet closes
// behind it.
const emit = defineEmits<{ dismiss: [] }>()

function runSetupAgain() {
  setupWizardMode.value = 'replay'
  emit('dismiss')
}
</script>

<template>
  <div class="replay-rows">
    <button type="button" class="data-item" @click="runSetupAgain">
      <span class="data-text">
        <span class="data-title">Run setup again</span>
        <span class="data-caption">Unit, look, and body weight. Nothing gets deleted.</span>
      </span>
      <span class="data-chevron" aria-hidden="true">›</span>
    </button>
  </div>
</template>
