<script setup lang="ts">
import { appIconName, type AppIconChoice } from '../lib/appIcon'
import PremiumMark from './PremiumMark.vue'

// Issue #145: one group of home-screen icons on the Theme screen (mockup
// docs/design/issue-145-app-icons.html, option A). ThemeSheet.vue shows the
// theme icons and, since #841, the seasonal ones in a second grid, and owns
// what a tap does. A caption (#861: Default's "Changes with the seasons") sits
// under the name.
defineProps<{
  icons: AppIconChoice[]
  labelledby: string
  current: string | null
  trying: string | null
  locked: (id: string) => boolean
}>()
const emit = defineEmits<{ pick: [icon: AppIconChoice] }>()
</script>

<template>
  <div class="icons" role="group" :aria-labelledby="labelledby">
    <button
      v-for="icon in icons"
      :key="icon.id"
      type="button"
      class="icon-pick"
      :class="{ selected: current === icon.id, trying: trying === icon.id }"
      :aria-label="`${appIconName(icon)} app icon`"
      :aria-pressed="current === icon.id"
      :aria-describedby="icon.caption ? `icon-caption-${icon.id}` : undefined"
      @click="emit('pick', icon)"
    >
      <span class="icon-frame">
        <img :src="icon.image" alt="" width="54" height="54" />
      </span>
      <!-- The sparkle stays on the last word's line when a name wraps. -->
      <span class="icon-label">
        {{ icon.label.split(' ').slice(0, -1).join(' ') }}
        <span class="icon-label-end">{{ icon.label.split(' ').slice(-1)[0] }}<PremiumMark v-if="locked(icon.id)" /></span>
      </span>
      <span v-if="icon.caption" :id="`icon-caption-${icon.id}`" class="icon-caption">{{ icon.caption }}</span>
    </button>
  </div>
</template>

<style scoped>
/* Four across fits 7 icons at 320px with no sideways scroll. */
.icons {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 8px;
  padding: 12px 8px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.icon-pick {
  min-height: 0;
  min-width: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: var(--text);
}

.icon-pick:active {
  transform: none;
}

.icon-frame {
  position: relative;
  width: 60px;
  height: 60px;
  padding: 3px;
  border-radius: 16px;
}

.icon-frame img {
  display: block;
  width: 54px;
  height: 54px;
}

.icon-pick.selected .icon-frame {
  box-shadow: 0 0 0 2px var(--accent);
}

.icon-pick.trying .icon-frame {
  box-shadow: 0 0 0 2px var(--secondary);
}

/* The check badge on the icon in use. */
.icon-pick.selected .icon-frame::after {
  content: '';
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  background: var(--accent);
}

.icon-pick.selected .icon-frame::before {
  content: '';
  position: absolute;
  z-index: 1;
  right: -1px;
  bottom: -1px;
  width: 12px;
  height: 12px;
  background: var(--accent-text);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5' fill='none' stroke='black' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5' fill='none' stroke='black' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / contain no-repeat;
}

.icon-label {
  max-width: 100%;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.15;
  text-align: center;
  overflow-wrap: anywhere;
}

.icon-caption {
  max-width: 100%;
  margin-top: -3px;
  font-size: 0.66rem;
  line-height: 1.15;
  text-align: center;
  color: var(--text-dim);
}

.icon-label-end {
  white-space: nowrap;
}

/* Raised without growing the line, so marked and plain labels line up. */
.icon-label :deep(.premium-mark) {
  position: relative;
  top: -1px;
  vertical-align: top;
}

.icon-pick.selected .icon-label {
  color: var(--accent);
}
</style>
