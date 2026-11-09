<script setup lang="ts">
import { premiumPrice } from '../lib/premium'
import { RESTORE_CAPTION, STORE_NAME } from '../lib/premiumStore'
import { usePremiumUnlock } from '../lib/premiumUnlock'

// Issue #531: Unlock Premium, Restore Purchases, Redeem a code, the restore
// caption, and the note and error lines, for every surface that sells Premium.
// `unlocked` fires when a purchase, restore, or redeemed code turns it on.
// `variant` only picks the look: the sheet's tall button and message boxes
// above it, or the Account card's compact button and plain lines below it.
const props = defineProps<{ variant: 'sheet' | 'card' }>()
const emit = defineEmits<{ unlocked: [] }>()

const { busy, error, note, redeemUrl, showRedeem, unlock, restore, openRedeem } = usePremiumUnlock(() => emit('unlocked'))
</script>

<template>
  <div class="unlock-actions" :class="props.variant">
    <template v-if="props.variant === 'sheet'">
      <p v-if="error" class="purchase-error" role="alert">{{ error }}</p>
      <p v-if="note" class="purchase-error" role="status">{{ note }}</p>
    </template>

    <button type="button" class="unlock" :disabled="busy" @click="unlock">
      <template v-if="busy">Connecting to {{ STORE_NAME }}…</template>
      <template v-else>Unlock Premium<template v-if="premiumPrice"> · {{ premiumPrice }}</template></template>
    </button>
    <div class="store-links">
      <button type="button" class="restore-link" :disabled="busy" @click="restore">Restore Purchases</button>
      <template v-if="redeemUrl && showRedeem()">
        <span class="link-dot" aria-hidden="true">·</span>
        <a class="restore-link" :href="redeemUrl" target="_blank" rel="noopener" @click="openRedeem">Redeem a code</a>
      </template>
    </div>
    <p class="restore-caption">{{ RESTORE_CAPTION }}</p>

    <template v-if="props.variant === 'card'">
      <p v-if="note" class="card-line" role="status">{{ note }}</p>
      <p v-if="error" class="card-line error-line" role="alert">{{ error }}</p>
    </template>
  </div>
</template>

<style scoped>
.unlock-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.unlock-actions.card {
  gap: 8px;
}

.purchase-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--highlight) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--highlight) 45%, var(--border));
  color: var(--text);
  font-size: 0.84rem;
  line-height: 1.45;
}

.unlock {
  width: 100%;
  min-height: 50px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.card .unlock {
  min-height: 44px;
  margin-top: 4px;
}

.unlock:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.store-links {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.link-dot {
  color: var(--text-dim);
}

.restore-link {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 8px;
  background: transparent;
  border: none;
  color: var(--secondary);
  font-size: 0.86rem;
  font-weight: 800;
  text-decoration: underline;
}

.restore-caption {
  margin: -8px 0 0;
  text-align: center;
  font-size: 0.76rem;
  color: var(--text-dim);
}

.card .restore-caption {
  margin: 0;
}

.card-line {
  margin: 0;
  font-size: 0.76rem;
  color: var(--text-dim);
}

.card-line.error-line {
  color: var(--danger);
  font-size: 0.8rem;
}
</style>
