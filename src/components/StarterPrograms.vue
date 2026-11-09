<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useTemplatesStore } from '../stores/templates'
import { FREE_TEMPLATE_LIMIT, isPremium, openPremiumSheet } from '../lib/premium'
import {
  STARTER_GROUPS,
  STARTER_PROGRAMS,
  programNeedsPremium,
  starterLiftEntry,
  type StarterProgram,
} from '../lib/starterPrograms'

// Issue #148: the Templates screen's Starter programs section. Each program
// opens a one-screen description (who it's for, days a week, a sample week,
// and its templates), and Add makes its templates.
//
// Issue #209: programs are free, and their templates count toward the free
// limit. Without Premium, Add on a program bigger than the limit opens the
// Premium sheet for programs, and one that won't fit next to the user's own
// templates opens the usual template-limit sheet; nothing is added either
// way.
//
// Issue #1012: without Premium, the limit shows before the tap. A meter counts
// the free routines used, each free program says whether it Fits or has No
// room, the bigger programs sit in a closed "Bigger programs" accordion, and a
// sheet that won't fit says why and offers See Premium instead of Add. With
// Premium none of that shows and every program sits in its equipment group.
defineProps<{ highlight?: boolean }>()
const emit = defineEmits<{ added: [names: string[], firstTemplateId: string | undefined, programName: string] }>()

const templates = useTemplatesStore()

const openId = ref<string | null>(null)
const open = computed(() => STARTER_PROGRAMS.find((p) => p.id === openId.value) ?? null)
const busy = ref(false)
const errorMessage = ref('')

function openProgram(program: StarterProgram) {
  errorMessage.value = ''
  openId.value = program.id
}

function close() {
  if (!busy.value) openId.value = null
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && openId.value) close()
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

function templateCount(program: StarterProgram): string {
  const n = program.templates.length
  return `${n} routine${n === 1 ? '' : 's'}`
}

// #167: grouped by the equipment each program needs. #209: free ones first
// in each group, so the first tap (and Home's glow) is never a paywall.
// #1012: without Premium, the bigger programs leave their groups for the
// accordion at the end.
const groups = computed(() =>
  STARTER_GROUPS.map((group) => ({
    ...group,
    programs: STARTER_PROGRAMS.filter((p) => p.group === group.id && !locked(p)).sort(
      (a, b) => Number(programNeedsPremium(a)) - Number(programNeedsPremium(b)),
    ),
  })).filter((group) => group.programs.length > 0),
)

const biggerPrograms = computed(() => STARTER_PROGRAMS.filter(locked))
const biggerOpen = ref(false)

function groupName(program: StarterProgram): string {
  return STARTER_GROUPS.find((g) => g.id === program.group)?.name ?? ''
}

function locked(program: StarterProgram): boolean {
  return !isPremium.value && programNeedsPremium(program)
}

// #1012: the free routine meter and each row's fit. Routines past the limit
// (from a restore) can push the count over 3; the dots just stay full.
const used = computed(() => templates.activeTemplates.length)
const showLimit = computed(() => !isPremium.value && templates.fetched)

function fits(program: StarterProgram): boolean {
  return isPremium.value || used.value + program.templates.length <= FREE_TEMPLATE_LIMIT
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five']
function inWords(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

// The sheet's note when Add can't happen on free: how many routines it adds,
// and how many to archive (when archiving alone can make room).
const toArchive = computed(() =>
  open.value ? used.value + open.value.templates.length - FREE_TEMPLATE_LIMIT : 0,
)
const blocked = computed(() => !!open.value && showLimit.value && !fits(open.value))

// #1012: Manage my routines goes back up to the user's own list, where each
// routine has its archive button.
function manageRoutines() {
  openId.value = null
  document.querySelector('.page-header')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function seePremium() {
  if (open.value) openPremiumSheet(programNeedsPremium(open.value) ? 'programs' : 'templates')
}

// Holds like a plank; a cardio block shows its own duration instead.
function hasTimed(program: StarterProgram): boolean {
  return program.templates.some((t) =>
    t.lifts.some((lift) => !lift.duration && starterLiftEntry(lift).loadType === 'timed'),
  )
}

async function addProgram() {
  if (!open.value || busy.value) return
  if (locked(open.value)) {
    openPremiumSheet('programs')
    return
  }
  const programName = open.value.name
  busy.value = true
  errorMessage.value = ''
  if (!(await templates.canAddProgram(open.value))) {
    busy.value = false
    openPremiumSheet('templates')
    return
  }
  const { data, error } = await templates.addStarterProgram(open.value)
  busy.value = false
  if (error) {
    errorMessage.value = error.message
    return
  }
  openId.value = null
  emit(
    'added',
    data.map((t) => t.name),
    data[0]?.id,
    programName,
  )
}
</script>

<template>
  <section class="starter" aria-labelledby="starter-heading">
    <h2 id="starter-heading" class="section-title">Starter programs</h2>
    <p class="section-sub">Optional starting points. Add one, then change anything.</p>
    <p v-if="showLimit" class="meter" data-testid="routine-meter">
      <span class="dots" aria-hidden="true">
        <i v-for="n in FREE_TEMPLATE_LIMIT" :key="n" :class="{ on: n <= used }" />
      </span>
      <span class="meter-text">
        <b>{{ used }} of {{ FREE_TEMPLATE_LIMIT }}</b> free routines used.<template v-if="used >= FREE_TEMPLATE_LIMIT">
          Archive routines to make room, or get Premium for no limit.</template
        >
      </span>
    </p>
    <div v-for="group in groups" :key="group.id" class="group" role="group" :aria-labelledby="`starter-group-${group.id}`">
      <h3 :id="`starter-group-${group.id}`" class="group-name">{{ group.name }}</h3>
      <p class="group-sub">{{ group.sub }}</p>
      <ul class="programs">
        <li v-for="program in group.programs" :key="program.id">
          <button
            type="button"
            class="program-row"
            :class="{ 'program-row-glow': highlight && program.id === groups[0].programs[0].id }"
            @click="openProgram(program)"
          >
            <span class="program-body">
              <span class="program-name">{{ program.name }}</span>
              <span class="program-sub"
                >{{ program.daysPerWeek }} · {{ templateCount(program)
                }}<template v-if="showLimit">
                  · <span v-if="fits(program)" class="fit">Fits</span><span v-else class="no-room">No room</span></template
                ></span
              >
            </span>
            <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </li>
      </ul>
    </div>

    <div v-if="biggerPrograms.length" class="bigger">
      <button
        type="button"
        class="bigger-head"
        :aria-expanded="biggerOpen"
        aria-controls="starter-bigger"
        @click="biggerOpen = !biggerOpen"
      >
        <span class="bigger-text">
          <span class="bigger-title">Bigger programs<span class="premium-tag">Premium</span></span>
          <span class="bigger-sub">5 routines each. Free holds up to {{ FREE_TEMPLATE_LIMIT }} routines.</span>
        </span>
        <svg class="chevron" :class="{ up: biggerOpen }" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <ul v-if="biggerOpen" id="starter-bigger" class="programs bigger-body">
        <li v-for="program in biggerPrograms" :key="program.id">
          <button type="button" class="program-row solid" @click="openProgram(program)">
            <span class="program-body">
              <span class="program-group">{{ groupName(program) }}</span>
              <span class="program-name">{{ program.name }}</span>
              <span class="program-sub">{{ program.daysPerWeek }} · {{ templateCount(program) }}</span>
            </span>
            <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </li>
      </ul>
    </div>

    <div v-if="open" class="overlay" role="dialog" aria-modal="true" :aria-label="open.name" @click.self="close">
      <div class="sheet">
        <div class="sheet-head">
          <span class="eyebrow">Starter program</span>
          <button type="button" class="close" aria-label="Close" @click="close">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <h3 class="sheet-title">{{ open.name }}</h3>
        <p class="days">{{ open.daysPerWeek }}</p>
        <p class="for-who">{{ open.forWho }}</p>

        <h4 class="label">A week</h4>
        <ol class="week">
          <li v-for="(slot, i) in open.week" :key="i">
            <span class="day">{{ slot.day }}</span>
            <span>{{ slot.template }}</span>
          </li>
        </ol>
        <p class="note">{{ open.note }}</p>

        <h4 class="label">Routines</h4>
        <div v-for="starter in open.templates" :key="starter.name" class="template" :aria-label="starter.name" role="group">
          <p class="template-name">{{ starter.name }}</p>
          <ul class="lifts">
            <li v-for="lift in starter.lifts" :key="lift.libraryId">
              <span class="lift-name">{{ starterLiftEntry(lift).name }}</span>
              <span class="lift-sets">{{ lift.duration ?? `${lift.sets} sets` }}</span>
            </li>
          </ul>
        </div>
        <p class="note">
          8 to 12 reps a set{{ hasTimed(open) ? ', and hold timed ones as long as your form stays good' : '' }}. Exercises
          you already have are reused as they are.
        </p>

        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        <p v-if="blocked && locked(open)" class="fit-note">
          This adds <b>{{ templateCount(open) }}</b>. Free holds up to {{ FREE_TEMPLATE_LIMIT }} routines. Get Premium for
          no limit.
        </p>
        <p v-else-if="blocked" class="fit-note">
          This adds <b>{{ templateCount(open) }}</b>. Free holds {{ FREE_TEMPLATE_LIMIT }} and you have {{ used }}. Archive
          {{ inWords(toArchive) }} of yours to make room, or get Premium for no limit.
        </p>
        <div v-if="blocked" class="actions">
          <button type="button" class="add" @click="seePremium">See Premium</button>
          <button type="button" class="ghost" @click="close">Close</button>
        </div>
        <div v-else class="actions">
          <button type="button" class="add" :disabled="busy" @click="addProgram">
            {{ busy ? 'Adding…' : `Add ${templateCount(open)}` }}
          </button>
          <button type="button" class="ghost" :disabled="busy" @click="close">Cancel</button>
        </div>
        <button v-if="blocked && !locked(open)" type="button" class="manage" @click="manageRoutines">
          Manage my routines
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.starter {
  margin-top: 28px;
}

.section-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
}

.section-sub {
  margin: 2px 0 12px;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.group + .group {
  margin-top: 18px;
}

.group-name {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--secondary);
}

.group-sub {
  margin: 2px 0 8px;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.programs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.program-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  min-height: 0;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text);
  text-align: left;
  font-weight: 400;
}

/* Issue #207: arriving from Home's "Start from a program". */
.program-row-glow {
  animation: program-glow 2.4s ease-out;
}

@keyframes program-glow {
  0%,
  60% {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--highlight) 60%, transparent);
  }
  100% {
    box-shadow: 0 0 0 2px transparent;
  }
}

.program-body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
}

.program-name {
  font-weight: 600;
}

.program-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.chevron {
  flex-shrink: 0;
  color: var(--text-dim);
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 16px;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: calc(100dvh - 32px - var(--safe-top, 0px));
  overflow-y: auto;
  margin-bottom: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.eyebrow {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--secondary);
}

.close {
  width: 36px;
  height: 36px;
  min-height: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.sheet-title {
  margin: 2px 0 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
}

.days {
  margin: 0 0 8px;
  color: var(--accent);
  font-weight: 700;
  font-size: 0.9rem;
}

.for-who {
  margin: 0 0 14px;
  font-size: 0.9rem;
  line-height: 1.45;
}

.label {
  margin: 14px 0 6px;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.week {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
}

.week li {
  display: flex;
  gap: 10px;
}

.day {
  width: 36px;
  flex-shrink: 0;
  color: var(--text-dim);
}

.note {
  margin: 6px 0 0;
  font-size: 0.8rem;
  color: var(--text-dim);
  line-height: 1.4;
}

.template {
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.template-name {
  margin: 0 0 4px;
  font-weight: 700;
}

.lifts li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.85rem;
  padding: 2px 0;
}

.lift-name {
  min-width: 0;
}

.lift-sets {
  flex-shrink: 0;
  color: var(--text-dim);
}

.error {
  color: var(--danger);
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.add {
  flex: 1;
  margin-top: 0;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.add:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.ghost {
  flex-shrink: 0;
  margin-top: 0;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

/* Issue #1012: the free routine meter, fit labels, and Bigger programs. */
.meter {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.82rem;
  line-height: 1.35;
}

.dots {
  display: flex;
  flex-shrink: 0;
  gap: 5px;
}

.dots i {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--border);
}

.dots i.on {
  background: var(--accent);
}

.meter-text {
  min-width: 0;
}

.meter-text b {
  font-weight: 800;
}

.fit {
  color: var(--secondary);
  font-weight: 700;
}

.no-room {
  color: color-mix(in srgb, var(--highlight) 45%, var(--text));
  font-weight: 700;
}

.program-group {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--secondary);
}

.bigger {
  margin-top: 18px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.bigger-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 12px 14px;
  min-height: 0;
  background: transparent;
  border: 0;
  color: var(--text);
  text-align: left;
  font-weight: 400;
}

.bigger-text {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
  gap: 2px;
}

.bigger-title {
  font-weight: 800;
}

.bigger-sub {
  font-size: 0.78rem;
  color: var(--text-dim);
  line-height: 1.35;
}

.premium-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 7px;
  border-radius: 99px;
  background: var(--surface);
  color: var(--accent);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  vertical-align: 2px;
}

.chevron.up {
  transform: rotate(180deg);
}

.bigger-body {
  padding: 0 10px 10px;
}

.program-row.solid {
  border-style: solid;
}

.fit-note {
  margin: 14px 0 0;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--highlight) 14%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--highlight) 45%, var(--border));
  border-radius: 12px;
  font-size: 0.84rem;
  line-height: 1.45;
}

.fit-note b {
  font-weight: 800;
}

.manage {
  display: block;
  width: 100%;
  margin: 8px 0 0;
  min-height: 0;
  padding: 6px;
  background: transparent;
  border: 0;
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 700;
  text-decoration: underline;
}
</style>
