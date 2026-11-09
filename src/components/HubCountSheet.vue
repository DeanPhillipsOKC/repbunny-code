<script setup lang="ts">
// Issue #581: what the Progress hub's "new bests" and "records" counted, and
// the rule each uses. A bottom sheet over the hub, same layering and Escape
// handling as RecordCheckSheet.vue. Mockup: docs/design/issue-581-hub-counts.html.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { NewBest } from '../lib/progressHub'
import { headlineText } from '../lib/progressHub'
import type { WeekRecord } from '../lib/progressReport'
import { formatSetLabel } from '../lib/setLabel'

export type HubCountKind = 'bests' | 'records'

const props = defineProps<{
  kind: HubCountKind
  bests: NewBest[]
  records: WeekRecord[]
  month: string
  // Est. 1RM is Premium (#132): free users see the set behind a best only.
  showE1rm: boolean
}>()

const emit = defineEmits<{
  dismiss: []
  switch: [kind: HubCountKind]
  chart: [exerciseId: string]
  check: [exerciseId: string, setId: string]
  report: []
}>()

const diffOpen = ref(false)
watch(
  () => props.kind,
  () => {
    diffOpen.value = false
  },
)

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

const title = computed(() => (props.kind === 'bests' ? plural(props.bests.length, 'new best') : plural(props.records.length, 'record')))

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function bestLine(best: NewBest): string {
  const s = best.set
  const set = formatSetLabel(best.exercise.load_type, s.reps, s.weight, s.weight_unit, s.level, {
    durationSeconds: s.duration_seconds,
    distance: s.distance,
    distanceUnit: s.distance_unit,
    incline: s.incline,
    calories: s.calories,
  })
  const parts = [set]
  if (best.metric === 'e1rm' && props.showE1rm) parts.push(`Est. 1RM ${headlineText(best.metric, best.value, best.unit)}`)
  parts.push(day(best.performedAt))
  return parts.join(' · ')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('dismiss')
}

onMounted(() => window.addEventListener('keydown', handleKeydown, true))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <div class="count-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="title">
      <div class="sheet-top">
        <div class="heading">
          <div class="kicker">Progress · {{ kind === 'bests' ? month : 'This week' }}</div>
          <h3 class="title">{{ title }}</h3>
        </div>
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <p v-if="kind === 'bests'" class="rule">
        A lift's <b>highest point ever on its chart</b>. That's Est. 1RM for weighted lifts, Longest for timed ones, Most reps for
        body weight.
        <button type="button" class="link" :aria-expanded="diffOpen" @click="diffOpen = !diffOpen">What's the difference from records?</button>
      </p>
      <p v-else class="rule">
        A <b>single set that beats your best weight × reps</b> for that lift.
        <button type="button" class="link" :aria-expanded="diffOpen" @click="diffOpen = !diffOpen">What's the difference from new bests?</button>
      </p>

      <div v-if="diffOpen" class="diff" data-testid="hub-count-difference">
        Records compare one set with another, so 12 × 120 beats 8 × 150. New bests follow each lift's chart, and Est. 1RM
        favors heavy sets, so 6 × 160 can be a new best without being a record.
        <button type="button" class="link" @click="emit('switch', kind === 'bests' ? 'records' : 'bests')">
          {{ kind === 'bests' ? `See the ${plural(records.length, 'record')}` : `See the ${plural(bests.length, 'new best')}` }} ›
        </button>
      </div>

      <ul v-if="kind === 'bests' && bests.length" class="rows">
        <li v-for="best in bests" :key="best.exercise.id">
          <div class="row-text">
            <div class="name">{{ best.exercise.name }}</div>
            <div class="sub">{{ bestLine(best) }}</div>
          </div>
          <button type="button" class="go" :aria-label="`Chart for ${best.exercise.name}`" @click="emit('chart', best.exercise.id)">
            Chart ›
          </button>
        </li>
      </ul>
      <ul v-else-if="kind === 'records' && records.length" class="rows">
        <li v-for="record in records" :key="record.setId">
          <div class="row-text">
            <div class="name">{{ record.name }}</div>
            <div class="sub">{{ record.set }} · {{ day(record.performedAt) }}</div>
            <div class="sub">Beat {{ record.beaten }}</div>
          </div>
          <button
            type="button"
            class="go"
            :aria-label="`Check the ${record.set} set of ${record.name}`"
            @click="emit('check', record.exerciseId, record.setId)"
          >
            Check ›
          </button>
        </li>
      </ul>
      <p v-else class="empty">{{ kind === 'bests' ? `No new bests yet in ${month}.` : 'No records yet this week.' }}</p>

      <button type="button" class="looks-wrong" @click="emit('report')">
        <span class="looks-wrong-icon" aria-hidden="true">!</span>This looks wrong
      </button>
    </div>
  </div>
</template>

<style scoped>
.count-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 16px 16px calc(20px + env(safe-area-inset-bottom, 0px));
}

.sheet-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.heading {
  min-width: 0;
}

.kicker {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.title {
  margin: 2px 0 6px;
  font-family: var(--font-display);
  font-size: 1.35rem;
  line-height: 1.2;
  font-weight: 700;
  color: var(--text);
}

.sheet-close {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  min-height: auto;
  padding: 0;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rule {
  margin: 0 0 10px;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.rule b {
  color: var(--text);
}

.link {
  display: inline;
  min-height: auto;
  padding: 0;
  background: none;
  border: none;
  color: var(--secondary);
  font-weight: 700;
  text-align: left;
}

.diff {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rows li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-top: 1px solid var(--border);
}

.rows li:last-child {
  border-bottom: 1px solid var(--border);
}

.row-text {
  min-width: 0;
}

.name {
  font-weight: 700;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.sub {
  margin-top: 2px;
  font-size: 0.82rem;
  color: var(--text-dim);
}

.go {
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 0 0 8px;
  background: none;
  border: none;
  color: var(--secondary);
  font-size: 0.88rem;
  font-weight: 800;
  white-space: nowrap;
}

.empty {
  margin: 0;
  padding: 14px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-size: 0.88rem;
  color: var(--text-dim);
}

.looks-wrong {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 0.8rem;
  font-weight: 700;
}

.looks-wrong-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  display: inline-grid;
  place-items: center;
  font-size: 0.62rem;
  font-weight: 800;
}
</style>
