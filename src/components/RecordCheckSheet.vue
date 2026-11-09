<script setup lang="ts">
// Issue #579: "Why wasn't this a record?" A bottom sheet over the lift's
// history (ExerciseHistoryDetail.vue), opened by tapping a set in Sessions.
// Every number comes from explainRecord (lib/recordCheck.ts). Same layering
// and Escape handling as OneRepMaxExplainer.vue: closing it lands back on
// the history. Mockup: docs/design/issue-579-record-check.html, option A.
import { onMounted, onUnmounted } from 'vue'
import type { RecordCheck, RecordCheckRef } from '../lib/recordCheck'

defineProps<{ check: RecordCheck; exerciseName: string }>()

const emit = defineEmits<{ dismiss: []; 'open-set': [ref: RecordCheckRef]; report: [] }>()

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('dismiss')
}

onMounted(() => window.addEventListener('keydown', handleKeydown, true))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown, true))
</script>

<template>
  <div class="record-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Record check">
      <div class="sheet-top">
        <div class="heading">
          <div class="kicker">{{ exerciseName }} · Set {{ check.set.setNumber }}</div>
          <h3 :class="['title', { record: check.status === 'record' }]">{{ check.title }}</h3>
        </div>
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <p class="rule">
        {{ check.rule.lead }} <b>{{ check.rule.key }}</b>{{ check.rule.tail }}
        <template v-if="check.note"> {{ check.note }}</template>
      </p>
      <p v-if="check.status === 'first'" class="rule">
        This is your first set of this lift, so it sets the starting point. The next set that beats it is a record.
      </p>

      <dl class="calc">
        <div v-for="line in check.lines" :key="line.label" class="line">
          <dt>
            {{ line.label }}<span v-if="line.sub" class="sub">{{ line.sub }}</span>
          </dt>
          <dd class="math">
            {{ line.math ? `${line.math} ` : '' }}<b>{{ line.total }}</b>
          </dd>
        </div>
        <div v-if="check.toBeat.length" class="line">
          <dt>To beat it</dt>
          <dd class="opts">
            <span v-for="(option, i) in check.toBeat" :key="option"><span v-if="i > 0" class="or">or</span><b>{{ option }}</b></span>
          </dd>
        </div>
        <div v-if="check.beatBy" class="line">
          <dt>Beat it by</dt>
          <dd class="math"><b>{{ check.beatBy }}</b></dd>
        </div>
      </dl>

      <template v-if="check.wins.length">
        <h4 class="wins-title">Small wins</h4>
        <ul class="wins">
          <li v-for="win in check.wins" :key="win.kind">
            <span>{{ win.label }}<span v-if="win.over" class="over"> ({{ win.over }})</span></span>
            <span :class="['win-value', win.state]">
              <svg v-if="win.state === 'earned'" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span v-if="win.state === 'earned'" class="visually-hidden">Earned: </span>{{ win.value }}
            </span>
          </li>
        </ul>
      </template>

      <button v-if="check.best" type="button" class="open-set" @click="emit('open-set', check.best)">
        {{ check.status === 'record' ? 'Open the set it beat' : 'Open the record set' }}
      </button>
      <button type="button" class="looks-wrong" @click="emit('report')">
        <span class="looks-wrong-icon" aria-hidden="true">!</span>This looks wrong
      </button>
    </div>
  </div>
</template>

<style scoped>
.record-overlay {
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
  overflow-wrap: anywhere;
}

.title {
  margin: 2px 0 6px;
  font-family: var(--font-display);
  font-size: 1.35rem;
  line-height: 1.2;
  font-weight: 700;
  color: var(--text);
}

.title.record {
  color: var(--highlight);
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
  margin: 0 0 12px;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.rule b {
  color: var(--text);
}

.calc {
  margin: 0 0 14px;
  padding: 2px 14px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  padding: 10px 0;
}

.line + .line {
  border-top: 1px solid var(--border);
}

.line dt {
  font-size: 0.88rem;
  white-space: nowrap;
}

.line dd {
  margin: 0;
}

.sub {
  display: block;
  margin-top: 2px;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.math {
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.math b,
.opts b {
  font-weight: 800;
}

.opts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
  text-align: right;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}

.or {
  margin-right: 4px;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-dim);
}

.wins-title {
  margin: 0 0 4px;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.wins {
  list-style: none;
  margin: 0;
  padding: 0;
}

.wins li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
  font-size: 0.86rem;
}

.over {
  font-size: 0.78rem;
  color: var(--text-dim);
}

.win-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--text-dim);
}

.win-value.earned {
  font-weight: 800;
  color: var(--success);
}

.open-set {
  width: 100%;
  margin-top: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 800;
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

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
