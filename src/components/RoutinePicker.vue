<script setup lang="ts">
import { computed } from 'vue'
import CategoryIcon from './CategoryIcon.vue'
import { activeTheme } from '../lib/theme'
import { FREEFORM_ART, routineArtForAll, routineArtSrc } from '../lib/routineArt'
import { TEMPLATE_CATEGORY_LABELS, TEMPLATE_CATEGORY_TINTS, type TemplateCategory } from '../lib/templateCategory'
import type { WorkoutTemplate } from '../lib/types'

// Log home's "What are you training today?" tiles (item 111), split out of
// WorkoutLogger.vue. Issue #987: each routine tile shows the mascot doing an
// exercise that fits it (lib/routineArt.ts) on a neutral art area, and
// Freeform gets the towel bunny. Minimal mascot mode keeps the category icon
// cards. Visible subtitles are aria-hidden and the category goes in
// aria-describedby, so each tile's accessible name stays just the name.
const props = defineProps<{
  routines: WorkoutTemplate[]
  categoryOf: (routine: WorkoutTemplate) => TemplateCategory
  starting: boolean
  selectedId: string | null
  glowId: string | null
}>()

const emit = defineEmits<{ start: [id: string] }>()

const showArt = computed(() => activeTheme.value.mascot !== 'minimal')

const tiles = computed(() => {
  const arts = routineArtForAll(props.routines, props.categoryOf)
  return props.routines.map((routine, i) => ({
    routine,
    category: props.categoryOf(routine),
    art: routineArtSrc(arts[i]),
  }))
})

const freeformArt = routineArtSrc(FREEFORM_ART)
</script>

<template>
  <div class="workout-picker" :class="{ 'workout-picker-art': showArt }" role="group" aria-labelledby="workout-template-label">
    <button
      v-for="{ routine, category, art } in tiles"
      :key="routine.id"
      type="button"
      class="chip template-chip workout-tile"
      :class="{
        'chip-selected': starting && selectedId === routine.id,
        'workout-tile-glow': glowId === routine.id,
      }"
      :data-category="category"
      :aria-describedby="`workout-tile-desc-${routine.id}`"
      :disabled="starting"
      @click="emit('start', routine.id)"
    >
      <span v-if="showArt" class="workout-tile-art" aria-hidden="true">
        <img class="mascot-art" :src="art" alt="" width="112" height="112" decoding="async" />
      </span>
      <span
        v-else
        class="workout-tile-badge"
        :style="{ '--tint': TEMPLATE_CATEGORY_TINTS[category] }"
        aria-hidden="true"
      >
        <CategoryIcon :category="category" />
      </span>
      <span class="workout-tile-text">
        <span class="workout-tile-name">{{ routine.name }}</span>
        <span class="workout-tile-sub" aria-hidden="true">{{ TEMPLATE_CATEGORY_LABELS[category] }}</span>
      </span>
      <span :id="`workout-tile-desc-${routine.id}`" hidden>{{ `${TEMPLATE_CATEGORY_LABELS[category]} routine` }}</span>
    </button>
    <button
      type="button"
      class="chip template-chip workout-tile workout-tile-freeform"
      :class="{ 'chip-selected': starting && selectedId === '' }"
      aria-describedby="workout-tile-freeform-sub"
      :disabled="starting"
      @click="emit('start', '')"
    >
      <span v-if="showArt" class="workout-tile-art" aria-hidden="true">
        <img class="mascot-art" :src="freeformArt" alt="" width="88" height="88" decoding="async" />
      </span>
      <span class="workout-tile-text">
        <span class="workout-tile-name">Freeform</span>
        <span id="workout-tile-freeform-sub" class="workout-tile-sub" aria-hidden="true">
          Add exercises as you go. No plan to follow, no auto-finish, and no progress chart. You can save it
          as a routine from the Workout log afterward.
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
/* Two columns, or one once a tile can't get 7.5em (issue #492: at a large
   Android font size two columns broke names mid-word). */
.workout-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(max(min(100%, 7.5em), calc((100% - 10px) / 2)), 1fr));
  gap: 10px;
}

.chip {
  min-height: 36px;
  padding: 0 14px;
  font-size: 0.85rem;
  font-weight: 500;
}

.template-chip {
  flex-shrink: 0;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-weight: 600;
}

.template-chip.chip-selected {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.template-chip.workout-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 2px;
  min-width: 0;
  min-height: 76px;
  padding: 12px 14px;
  border-radius: 14px;
  text-align: left;
  color: var(--text);
}

.workout-tile-glow {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--highlight) 60%, transparent);
}

.template-chip.workout-tile:disabled {
  opacity: 0.6;
}

.template-chip.workout-tile.chip-selected:disabled {
  opacity: 1;
}

.workout-tile-badge {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tint) 18%, transparent);
  color: var(--tint);
}

.workout-tile.chip-selected .workout-tile-badge {
  background: rgba(255, 255, 255, 0.35);
  color: var(--accent-text);
}

.workout-tile-badge .category-icon {
  width: 36px;
  height: 36px;
}

.workout-tile-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
}

.workout-tile-name {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.workout-tile-sub {
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-dim);
}

.workout-tile.workout-tile-freeform {
  grid-column: 1 / -1;
  min-height: 0;
}

.workout-tile.chip-selected .workout-tile-sub {
  color: inherit;
  opacity: 0.85;
}

/* Issue #987: art tiles. The art area is neutral in every theme (no category
   tint): a touch lighter than the tile, edge to edge across its top. */
.workout-picker-art .template-chip.workout-tile {
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.workout-tile-art {
  display: grid;
  place-items: center;
  align-self: stretch;
  height: 118px;
  background: color-mix(in srgb, var(--text) 6%, var(--surface-2));
}

.workout-tile-art img {
  display: block;
  width: 112px;
  max-width: 100%;
  height: 112px;
  object-fit: contain;
}

.workout-picker-art .workout-tile-text {
  align-self: stretch;
  padding: 10px 14px 12px;
}

.workout-tile.chip-selected .workout-tile-art {
  background: color-mix(in srgb, var(--accent-text) 18%, var(--accent));
}

/* Freeform: the towel bunny on the left of its text, full width. */
.workout-picker-art .workout-tile.workout-tile-freeform {
  flex-direction: row;
  align-items: stretch;
}

.workout-tile-freeform .workout-tile-art {
  flex: 0 0 auto;
  width: 104px;
  height: auto;
  min-height: 96px;
}

.workout-tile-freeform .workout-tile-art img {
  width: 88px;
  height: 88px;
}

.workout-picker-art .workout-tile-freeform .workout-tile-text {
  flex: 1 1 auto;
  justify-content: center;
  padding: 12px 14px;
}
</style>
