<script setup lang="ts">
// Backlog item 93: shown only when LoadTypeSelect's Timed card is picked.
// Unlike load type, these three booleans stay editable after the exercise
// has logged sets (docs/backlog.md item 93) — turning one off just hides
// that column for new sets, past sets keep whatever value they already have
// — so this component takes no `disabled` prop the way LoadTypeSelect does.
//
// The real <input type="checkbox"> stays in the DOM (transparent, not
// display:none) so it keeps native keyboard/focus/screen-reader/click
// behavior -- but the app's global `input { appearance: none; min-height:
// 48px; ... }` reset (src/style.css, written for text/number/select fields)
// strips a plain checkbox down to a blank full-width box with no
// checked-state indicator at all. A custom visual box layered underneath it
// (same footprint, driven by the prop rather than CSS `:checked`, which the
// reset also fights) replaces it, matching the mockup's small rounded
// square + checkmark. The input sits exactly on top of that box (not
// shrunk to 1px off in a corner) so a click or tap on it -- not just on the
// label's text -- lands on the real control.
defineProps<{
  tracksDistance: boolean
  tracksIncline: boolean
  tracksLevel: boolean
  tracksCalories: boolean
}>()

defineEmits<{
  'update:tracksDistance': [value: boolean]
  'update:tracksIncline': [value: boolean]
  'update:tracksLevel': [value: boolean]
  'update:tracksCalories': [value: boolean]
}>()
</script>

<template>
  <fieldset class="tracking-field">
    <legend>What do you track besides time?</legend>
    <label class="tracking-option">
      <span class="tracking-checkbox">
        <span class="tracking-checkbox-box" :class="{ 'tracking-checkbox-box-checked': tracksDistance }" aria-hidden="true">
          <svg v-if="tracksDistance" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <input
          type="checkbox"
          aria-label="Distance"
          class="tracking-checkbox-input"
          :checked="tracksDistance"
          @change="$emit('update:tracksDistance', ($event.target as HTMLInputElement).checked)"
        />
      </span>
      <span class="tracking-option-text" aria-hidden="true">
        <span class="tracking-option-title">Distance</span>
        <span class="tracking-option-desc">Treadmill, bike, rower</span>
      </span>
    </label>
    <label class="tracking-option">
      <span class="tracking-checkbox">
        <span class="tracking-checkbox-box" :class="{ 'tracking-checkbox-box-checked': tracksIncline }" aria-hidden="true">
          <svg v-if="tracksIncline" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <input
          type="checkbox"
          aria-label="Incline"
          class="tracking-checkbox-input"
          :checked="tracksIncline"
          @change="$emit('update:tracksIncline', ($event.target as HTMLInputElement).checked)"
        />
      </span>
      <span class="tracking-option-text" aria-hidden="true">
        <span class="tracking-option-title">Incline</span>
        <span class="tracking-option-desc">Treadmill, from 0, in half steps</span>
      </span>
    </label>
    <label class="tracking-option">
      <span class="tracking-checkbox">
        <span class="tracking-checkbox-box" :class="{ 'tracking-checkbox-box-checked': tracksLevel }" aria-hidden="true">
          <svg v-if="tracksLevel" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <input
          type="checkbox"
          aria-label="Level"
          class="tracking-checkbox-input"
          :checked="tracksLevel"
          @change="$emit('update:tracksLevel', ($event.target as HTMLInputElement).checked)"
        />
      </span>
      <span class="tracking-option-text" aria-hidden="true">
        <span class="tracking-option-title">Level</span>
        <span class="tracking-option-desc">Stair stepper, elliptical</span>
      </span>
    </label>
    <label class="tracking-option">
      <span class="tracking-checkbox">
        <span class="tracking-checkbox-box" :class="{ 'tracking-checkbox-box-checked': tracksCalories }" aria-hidden="true">
          <svg v-if="tracksCalories" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <input
          type="checkbox"
          aria-label="Calories"
          class="tracking-checkbox-input"
          :checked="tracksCalories"
          @change="$emit('update:tracksCalories', ($event.target as HTMLInputElement).checked)"
        />
      </span>
      <span class="tracking-option-text" aria-hidden="true">
        <span class="tracking-option-title">Calories</span>
        <span class="tracking-option-desc">From the machine, or your own estimate. Not derived from anything RepBunny tracks.</span>
      </span>
    </label>
    <p class="tracking-note">Leave all off for things like planks. You can change these later.</p>
  </fieldset>
</template>

<style scoped>
.tracking-field {
  margin: 12px 0 4px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tracking-field legend {
  padding: 0 4px;
  font-size: 0.85rem;
  color: var(--text-dim);
}

.tracking-option {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0 4px;
  cursor: pointer;
}

.tracking-checkbox {
  position: relative;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
}

.tracking-checkbox-box {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border-radius: 6px;
  border: 2px solid var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-text);
}

.tracking-checkbox-box-checked {
  background: var(--accent);
  border-color: var(--accent);
}

.tracking-checkbox-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  margin: 0;
  padding: 0;
  opacity: 0;
  cursor: pointer;
}

.tracking-checkbox:focus-within .tracking-checkbox-box {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tracking-option-text {
  display: flex;
  flex-direction: column;
}

.tracking-option-title {
  font-weight: 700;
}

.tracking-option-desc {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.tracking-note {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-dim);
}
</style>
