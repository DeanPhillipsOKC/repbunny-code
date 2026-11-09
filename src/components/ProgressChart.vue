<script setup lang="ts">
// Issue #21: progress-over-time chart card body (headline, change pill,
// line chart, range pills). Generic on purpose -- the caller supplies the
// points, label, unit, and formatter -- so the Progress hub (#44) can reuse
// it. Hand-drawn SVG, same no-chart-library approach as BodyWeightChart.vue.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { changeArrow, filterByRange, PROGRESS_RANGES, type ChartPoint, type ProgressRange } from '../lib/progressSeries'
import PremiumMark from './PremiumMark.vue'
import WorkoutStory from './WorkoutStory.vue'

const props = defineProps<{
  points: ChartPoint[]
  range: ProgressRange
  label: string
  unit: string
  format: (value: number) => string
  // Lower is better (assist): the axis flips so "up" still means better.
  flipped?: boolean
  note?: string
  // Issue #132: a free user's Premium preview. The chart blurs under the
  // `overlay` slot; the range pills stay usable, and `lockedRanges` get a
  // small Premium mark.
  blurred?: boolean
  lockedRanges?: ProgressRange[]
  // Issue #158: show the tapped point's story in a strip under the chart.
  // Off when the caller tells it somewhere else (template progress's
  // session card).
  storyInline?: boolean
  // Issue #578: the tooltip offers "See the sets ›", which emits `seeSets`.
  seeSets?: boolean
}>()

// `select` reports the tapped point (null when cleared), so a caller can show
// more about that session (template progress, #157).
const emit = defineEmits<{
  'update:range': [range: ProgressRange]
  select: [point: ChartPoint | null]
  seeSets: [point: ChartPoint]
}>()

const width = 326
const height = 150
const plotLeft = 8
const plotRight = width - 30
const plotTop = 12
const plotBottom = height - 10

const inRange = computed(() => filterByRange(props.points, props.range))
const enough = computed(() => inRange.value.length >= 2)

const unitSuffix = computed(() => (props.unit ? ` ${props.unit}` : ''))

// Latest wins a tie, so a repeated best lands on the newest session.
const bestIndex = computed(() => {
  let index = 0
  inRange.value.forEach((p, i) => {
    const best = inRange.value[index].value
    if (props.flipped ? p.value <= best : p.value >= best) index = i
  })
  return index
})

const first = computed(() => inRange.value[0])
const last = computed(() => inRange.value[inRange.value.length - 1])
const best = computed(() => inRange.value[bestIndex.value])

// Issue #131: the headline is the latest session and the pill compares it
// to the range's first; positive is better (lower, when flipped). The best
// stays on the sub-line and the highlighted dot.
const change = computed(() => {
  if (!enough.value) return 0
  return props.flipped ? first.value.value - last.value.value : last.value.value - first.value.value
})
const trend = computed(() => {
  if (props.format(Math.abs(change.value)) === props.format(0)) return 'flat'
  return change.value > 0 ? 'up' : 'down'
})
const arrow = computed(() => changeArrow(first.value.value, last.value.value))

// Issue #578: tapping the pill shows its math, "190 on Oct 12 − 146 on
// Sep 17 = ▲ 44" (first minus latest when lower is better).
const pillOpen = ref(false)
const pillMath = computed(() => {
  if (!enough.value) return ''
  const term = (p: ChartPoint) => `${props.format(p.value)} on ${formatDate(p.performedAt)}`
  const [a, b] = props.flipped ? [first.value, last.value] : [last.value, first.value]
  const result = trend.value === 'flat' ? 'no change' : `${arrow.value} ${props.format(Math.abs(change.value))}${unitSuffix.value}`
  return `${term(a)} − ${term(b)} = ${result}`
})

function togglePill() {
  selected.value = null
  pillOpen.value = !pillOpen.value
}

const rangeAria = computed(() => ({ '1M': '1 month', '3M': '3 months', '1Y': '1 year', All: 'all time' })[props.range])

const subLine = computed(() => {
  const b = best.value
  return `Best: ${b.detail ?? props.format(b.value) + unitSuffix.value} on ${formatDate(b.performedAt)}`
})

const ariaLabel = computed(
  () => `${props.label} over ${rangeAria.value}, from ${props.format(first.value.value)} to ${props.format(last.value.value)}${unitSuffix.value}`,
)

// A flat line (every session the same) would divide by zero -- pad it so it
// draws through the middle instead.
const bounds = computed(() => {
  const values = inRange.value.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return hi === lo ? { lo: lo - 1, hi: hi + 1 } : { lo, hi }
})

function x(index: number): number {
  const n = inRange.value.length
  if (n <= 1) return (plotLeft + plotRight) / 2
  return plotLeft + (index / (n - 1)) * (plotRight - plotLeft)
}

function y(value: number): number {
  const { lo, hi } = bounds.value
  const t = (value - lo) / (hi - lo)
  const plotHeight = plotBottom - plotTop
  return props.flipped ? plotTop + t * plotHeight : plotBottom - t * plotHeight
}

const gridlines = computed(() => {
  const { lo, hi } = bounds.value
  const mid = (lo + hi) / 2
  const [top, bottom] = props.flipped ? [lo, hi] : [hi, lo]
  return [
    { y: plotTop, value: top },
    { y: (plotTop + plotBottom) / 2, value: mid },
    { y: plotBottom, value: bottom },
  ]
})

const linePoints = computed(() => inRange.value.map((p, i) => `${x(i)},${y(p.value)}`).join(' '))
const areaPoints = computed(() => {
  const n = inRange.value.length
  return `${x(0)},${height} ${linePoints.value} ${x(n - 1)},${height}`
})

const dateLabels = computed(() => {
  const n = inRange.value.length
  const centeredOn = (i: number) => ({ left: `${(x(i) / width) * 100}%`, transform: 'translateX(-50%)' })
  const labels: { key: string; text: string; style: Record<string, string> }[] = [
    { key: 'first', text: formatDate(first.value.performedAt), style: { left: '0' } },
  ]
  if (n >= 3) {
    const mid = Math.floor((n - 1) / 2)
    labels.push({ key: 'mid', text: formatDate(inRange.value[mid].performedAt), style: centeredOn(mid) })
  }
  labels.push({ key: 'last', text: formatDate(last.value.performedAt), style: centeredOn(n - 1) })
  return labels
})

const selected = ref<number | null>(null)
watch(
  () => [props.range, props.points],
  () => {
    selected.value = null
    pillOpen.value = false
  },
)

watch(selected, (i) => emit('select', i === null ? null : (inRange.value[i] ?? null)))

const tooltip = computed(() => {
  if (selected.value === null) return null
  const p = inRange.value[selected.value]
  if (!p) return null
  const px = x(selected.value)
  const py = y(p.value)
  const shiftY = py < 50 ? '12px' : 'calc(-100% - 12px)'
  // A receipt can be wider than the chart's edges allow, so it hangs from
  // the side of the chart its point is on (#578).
  const receipt = !!(p.math?.length || p.previous || props.seeSets)
  const shiftX = px / width < 0.25 ? '-15%' : px / width > 0.75 ? '-85%' : '-50%'
  const style = receipt
    ? { top: `${(py / height) * 100}%`, transform: `translateY(${shiftY})`, ...(px / width < 0.5 ? { left: '0' } : { right: '0' }) }
    : { left: `${(px / width) * 100}%`, top: `${(py / height) * 100}%`, transform: `translate(${shiftX}, ${shiftY})` }
  return { point: p, receipt, style }
})

// Issue #158: a speech-bubble badge over each point with a story, or under
// it when the point sits at the top of the plot. Issue #168: one badge per
// point -- a pencil for a note alone, the bubble with a pink dot for both.
// When points sit closer than a badge is wide, every badge drops to a pip.
const BADGE_SPACING = 18
const dense = computed(() => inRange.value.length > 1 && (plotRight - plotLeft) / (inRange.value.length - 1) < BADGE_SPACING)
const markers = computed(() =>
  inRange.value.flatMap((p, i) => {
    const story = !!p.story?.length
    const note = !!p.note
    if (!story && !note) return []
    const py = y(p.value)
    const offset = dense.value ? 9 : 20
    return [{ index: i, x: x(i), y: py < plotTop + 18 ? py + offset : py - offset, story, note }]
  }),
)

const selectedStory = computed(() => {
  if (!props.storyInline || selected.value === null) return null
  const p = inRange.value[selected.value]
  return p?.story?.length ? { date: formatDate(p.performedAt), lines: p.story } : null
})

function select(index: number) {
  pillOpen.value = false
  selected.value = selected.value === index ? null : index
}

function clearSelection() {
  selected.value = null
  pillOpen.value = false
}

function openSets(point: ChartPoint) {
  selected.value = null
  emit('seeSets', point)
}

onMounted(() => document.addEventListener('click', clearSelection))
onUnmounted(() => document.removeEventListener('click', clearSelection))

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="progress-chart">
    <div class="chart-body" :class="{ previewing: blurred }">
      <div class="chart-content" :class="{ blurred }" :inert="blurred" :aria-hidden="blurred || undefined">
        <div class="label-row">
          <span class="metric-label">{{ label }}</span>
          <slot name="action" />
        </div>

        <template v-if="enough">
          <div class="headline">
            <span class="headline-value">{{ format(last.value) }}<small v-if="unit">{{ unitSuffix }}</small></span>
            <button
              type="button"
              :class="['change-pill', trend]"
              :aria-expanded="pillOpen"
              @click.stop="togglePill"
            >
              <template v-if="trend === 'flat'">No change</template>
              <template v-else>{{ arrow }} {{ format(Math.abs(change)) }}{{ unitSuffix }}</template>
            </button>
          </div>
          <p v-if="pillOpen" class="tooltip pill-math" role="status" @click.stop>{{ pillMath }}</p>
          <p class="sub-line">{{ subLine }}</p>

          <div class="chart-wrap">
            <svg :viewBox="`0 0 ${width} ${height}`" class="chart-svg" role="img" :aria-label="ariaLabel">
              <g v-for="(g, i) in gridlines" :key="i">
                <line :x1="0" :x2="width" :y1="g.y" :y2="g.y" class="grid" />
                <text :x="width - 2" :y="g.y + 3" text-anchor="end" class="grid-label">{{ format(g.value) }}</text>
              </g>
              <polygon :points="areaPoints" class="area" />
              <polyline :points="linePoints" fill="none" class="line" />
              <circle
                v-for="(p, i) in inRange"
                :key="i"
                :cx="x(i)"
                :cy="y(p.value)"
                :r="i === bestIndex || i === selected ? 5 : 3"
                :class="['dot', { best: i === bestIndex, selected: i === selected }]"
              />
              <circle
                v-for="(p, i) in inRange"
                :key="`hit-${i}`"
                :cx="x(i)"
                :cy="y(p.value)"
                r="14"
                class="hit"
                @click.stop="select(i)"
              />
              <g
                v-for="m in markers"
                :key="`marker-${m.index}`"
                :transform="`translate(${m.x} ${m.y})`"
                :class="['story-marker', { pip: dense }]"
                :data-testid="m.story ? 'story-marker' : 'note-marker'"
                :data-note="m.note || undefined"
                @click.stop="select(m.index)"
              >
                <circle v-if="dense" r="3" />
                <template v-else>
                  <circle r="8" />
                  <path v-if="m.story" d="M-4 -3h8v5h-4l-3 2.5v-2.5h-1z" />
                  <path v-else d="M-3.6 3.6l0.8-2.6 4.4-4.4 1.8 1.8-4.4 4.4z" />
                  <circle v-if="m.story && m.note" cx="6" cy="-6" r="3.2" class="note-dot" />
                </template>
              </g>
            </svg>
            <div v-if="tooltip" :class="['tooltip', { receipt: tooltip.receipt }]" :style="tooltip.style" role="status" @click.stop>
              {{ formatDate(tooltip.point.performedAt) }} · <b>{{ format(tooltip.point.value) }}{{ unitSuffix }}</b>
              <template v-if="tooltip.point.detail"><br />{{ tooltip.point.detail }}</template>
              <span v-for="(line, i) in tooltip.point.math" :key="`m${i}`" class="receipt-line">{{ line }}</span>
              <span v-if="tooltip.point.previous" class="receipt-line">{{ tooltip.point.previous }}</span>
              <button v-if="seeSets" type="button" class="see-sets" @click.stop="openSets(tooltip.point)">See the sets ›</button>
            </div>
          </div>
          <div class="axis">
            <span v-for="l in dateLabels" :key="l.key" :style="l.style">{{ l.text }}</span>
          </div>
          <WorkoutStory v-if="selectedStory" class="chart-story" :lines="selectedStory.lines" :date="selectedStory.date" @click.stop />
          <p v-if="note" class="note">{{ note }}</p>
        </template>

        <p v-else class="not-enough">
          Not enough sessions in this range.
          <button v-if="range !== 'All'" type="button" class="link-button" @click="emit('update:range', 'All')">Show all</button>
        </p>
      </div>
      <div v-if="blurred" class="chart-overlay"><slot name="overlay" /></div>
    </div>

    <div class="ranges" role="group" aria-label="Chart range">
      <button
        v-for="r in PROGRESS_RANGES"
        :key="r"
        type="button"
        :class="{ active: r === range }"
        :aria-pressed="r === range"
        @click="emit('update:range', r)"
      >
        {{ r }}<PremiumMark v-if="lockedRanges?.includes(r)" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.chart-body {
  position: relative;
}

/* Room for the preview card even when the range has too few sessions. */
.chart-body.previewing {
  min-height: 200px;
}

/* Enough to read the line's shape, not the numbers. */
.chart-content.blurred {
  filter: blur(5px);
  opacity: 0.7;
  user-select: none;
  pointer-events: none;
}

.chart-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 8px 4px;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 22px;
}

.metric-label {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.headline {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 2px 0;
}

.headline-value {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--accent);
}

.headline-value small {
  font-size: 1rem;
}

.change-pill {
  font-size: 0.78rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.headline .change-pill {
  min-height: auto;
  border: none;
  font-family: inherit;
  cursor: pointer;
}

.change-pill.up {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
}

.change-pill.flat,
.change-pill.down {
  color: var(--text-dim);
  background: var(--surface-2);
}

.sub-line {
  margin: 0 0 6px;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.chart-wrap {
  position: relative;
}

.chart-svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.grid {
  stroke: var(--border);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.grid-label {
  fill: var(--text-dim);
  font-size: 9px;
  font-family: var(--font-body);
}

.area {
  fill: var(--accent);
  opacity: 0.1;
}

.line {
  stroke: var(--accent);
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.dot {
  fill: var(--accent);
}

.dot.best {
  fill: var(--highlight);
}

.dot.selected {
  fill: var(--bg);
  stroke: var(--accent);
  stroke-width: 2.5;
}

.hit {
  fill: transparent;
  cursor: pointer;
}

.story-marker {
  cursor: pointer;
}

.story-marker circle {
  fill: var(--secondary);
}

.story-marker path {
  fill: var(--accent-text);
}

.story-marker .note-dot {
  fill: var(--accent);
  stroke: var(--surface);
  stroke-width: 1.5;
}

.chart-story {
  margin-top: 8px;
}

.tooltip {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  background: var(--surface-2);
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 5px 9px;
  font-size: 0.72rem;
  line-height: 1.35;
  white-space: nowrap;
  color: var(--text);
}

.tooltip.receipt {
  width: max-content;
  max-width: 100%;
  white-space: normal;
  pointer-events: auto;
  padding: 7px 10px;
}

.receipt-line {
  display: block;
  margin-top: 2px;
  color: var(--text-dim);
}

.see-sets {
  display: block;
  min-height: 32px;
  margin-top: 2px;
  padding: 0;
  background: none;
  border: none;
  color: var(--secondary);
  font-size: 0.76rem;
  font-weight: 800;
}

.pill-math {
  position: static;
  display: inline-block;
  margin: 2px 0 6px;
  white-space: normal;
}

.tooltip b {
  color: var(--accent);
}

.axis {
  position: relative;
  height: 1.1rem;
  margin-top: 2px;
  font-size: 0.7rem;
  color: var(--text-dim);
}

.axis span {
  position: absolute;
  top: 0;
  white-space: nowrap;
}

.note {
  margin: 6px 0 0;
  font-size: 0.72rem;
  color: var(--text-dim);
}

.not-enough {
  margin: 10px 0 4px;
  padding: 18px 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-dim);
}

.link-button {
  min-height: auto;
  padding: 0;
  background: none;
  border: none;
  color: var(--secondary);
  font-weight: 700;
  text-decoration: underline;
}

.ranges {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.ranges button {
  flex: 1;
  min-height: 32px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 0.74rem;
  font-weight: 800;
}

.ranges button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
</style>
