<script setup lang="ts">
import { ref } from 'vue'
import { isPremium, resetPremiumHints, setDevPremium } from '../lib/premium'
import './account-rows.css'

// Issue #113: dev-only rows in Account > Preferences (local mode) for trying
// the free version. AccountSheet loads this only when import.meta.env.DEV or
// the personal build's VITE_DEV_TOOLS flag (#784), so store builds never
// include it and nothing there can flip Premium.
// Styles mirror AccountSheet's .pref-row, .switch, and .pref-action, since
// its scoped styles don't reach a child component; the row text styles come
// from account-rows.css.

const hintsReset = ref(false)

function resetHints() {
  resetPremiumHints()
  hintsReset.value = true
}
</script>

<template>
  <div class="pref-row">
    <span class="data-text">
      <span id="dev-premium-pref" class="data-title">Premium (dev)</span>
      <span class="data-caption">Dev and personal builds only. Off shows the free version.</span>
    </span>
    <button
      type="button"
      role="switch"
      class="switch"
      :aria-checked="isPremium"
      aria-labelledby="dev-premium-pref"
      @click="setDevPremium(!isPremium)"
    >
      <span class="knob" aria-hidden="true"></span>
    </button>
  </div>
  <div class="pref-row stacked">
    <span class="data-title">Reset Premium hints (dev)</span>
    <span class="data-caption">
      {{ hintsReset ? 'Done. One-time hints will show again.' : 'Shows the one-time Premium hints again.' }}
    </span>
    <button type="button" class="pref-action" @click="resetHints">Reset Premium hints (dev)</button>
  </div>
</template>

<style scoped>
.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 10px 10px 14px;
}

.pref-row.stacked {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding-right: 14px;
}

.pref-action {
  min-height: 44px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
}

.switch {
  position: relative;
  width: 46px;
  height: 28px;
  min-height: 28px;
  padding: 0;
  margin-right: 4px;
  flex-shrink: 0;
  border-radius: 14px;
  background: var(--border);
  border: none;
}

.switch[aria-checked='true'] {
  background: var(--accent);
}

.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--text-dim);
  transition: left 0.15s ease;
}

.switch[aria-checked='true'] .knob {
  left: 21px;
  background: var(--accent-text);
}
</style>
