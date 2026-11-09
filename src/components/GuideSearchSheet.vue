<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue'
import { themeArt } from '../lib/theme'
import { sendHelpRequest } from '../lib/bugReport'
import type { GuideEntry, GuideSearch } from '../lib/guideSearch'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #568 (design docs/design/issue-568-guide-search.html, option A): Help &
// guides, searchable and readable in the app. Before typing it lists every
// guide under the website's topics; typing ranks them (lib/guideSearch.ts).
// A guide opens as text here, with a link to its page on repbunny.app. The
// index and MiniSearch load as their own chunk when the sheet opens, and
// nothing here makes a network request. Rendered by AccountSheet.vue.
const emit = defineEmits<{ back: []; dismiss: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('back'))

const guides = shallowRef<GuideEntry[]>([])
const searcher = shallowRef<GuideSearch | null>(null)
const query = ref('')
const openSlug = ref<string | null>(null)
const sending = ref(false)
const sheet = ref<HTMLElement | null>(null)

onMounted(async () => {
  const [{ default: index }, { createGuideSearch }] = await Promise.all([import('virtual:guide-index'), import('../lib/guideSearch')])
  guides.value = index
  searcher.value = createGuideSearch(index)
})

const ready = computed(() => searcher.value !== null)
const trimmed = computed(() => query.value.trim())
const hits = computed(() => (searcher.value && trimmed.value ? searcher.value.search(trimmed.value) : []))

const topics = computed(() => {
  const groups: { topic: string; guides: GuideEntry[] }[] = []
  for (const g of guides.value) {
    const last = groups[groups.length - 1]
    if (last?.topic === g.topic) last.guides.push(g)
    else groups.push({ topic: g.topic, guides: [g] })
  }
  return groups
})

const openGuide = computed(() => guides.value.find((g) => g.slug === openSlug.value) ?? null)

async function open(slug: string) {
  openSlug.value = slug
  await nextTick()
  sheet.value?.scrollTo({ top: 0 })
}

function back() {
  if (openSlug.value) openSlug.value = null
  else emit('back')
}

async function emailSupport() {
  sending.value = true
  try {
    await sendHelpRequest(trimmed.value, __APP_VERSION__)
  } finally {
    sending.value = false
  }
}

const guideUrl = (slug: string) => `https://repbunny.app/guides/${slug}/`
</script>

<template>
  <div ref="sheet" class="sheet" role="dialog" aria-modal="true" aria-labelledby="guides-title">
    <div class="sheet-top">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-header">
        <button type="button" class="sheet-back" :aria-label="openGuide ? 'Back to guides' : 'Back to Account'" @click="back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6"></path>
          </svg>
        </button>
        <h3 id="guides-title" class="sheet-title">Help &amp; guides</h3>
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <label v-if="!openGuide" class="search">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <span class="sr-only">Search the guides</span>
        <input v-model="query" type="search" placeholder="Search the guides" enterkeyhint="search" autocomplete="off" :disabled="!ready" />
        <button v-if="query" type="button" class="search-clear" aria-label="Clear search" @click="query = ''">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
          </svg>
        </button>
      </label>
    </div>

    <article v-if="openGuide" class="reader" :aria-labelledby="`guide-${openGuide.slug}`">
      <h4 :id="`guide-${openGuide.slug}`" class="reader-title">{{ openGuide.title }}</h4>
      <p class="reader-lede">
        <template v-for="(run, i) in openGuide.lede" :key="i"><strong v-if="run.strong">{{ run.text }}</strong><template v-else>{{ run.text }}</template></template>
      </p>
      <ol class="steps">
        <li v-for="(step, i) in openGuide.steps" :key="i" class="step">
          <span class="step-num" aria-hidden="true">{{ i + 1 }}</span>
          <div class="step-body">
            <h5 class="step-heading">{{ step.heading }}</h5>
            <p v-for="(block, j) in step.blocks" :key="j" :class="{ bullet: block.bullet }">
              <template v-for="(run, k) in block.runs" :key="k"><strong v-if="run.strong">{{ run.text }}</strong><template v-else>{{ run.text }}</template></template>
            </p>
          </div>
        </li>
      </ol>
      <a class="web-link" :href="guideUrl(openGuide.slug)" target="_blank" rel="noopener">Open on repbunny.app<span aria-hidden="true"> ↗</span></a>
    </article>

    <template v-else-if="!trimmed">
      <section v-for="group in topics" :key="group.topic" class="topic" :aria-label="group.topic">
        <h4 class="topic-label">{{ group.topic }}</h4>
        <ul class="list">
          <li v-for="g in group.guides" :key="g.slug">
            <button type="button" class="item" @click="open(g.slug)">
              <span class="item-text">
                <span class="item-title">{{ g.title }}</span>
                <span class="item-caption">{{ g.summary }}</span>
              </span>
              <span class="chevron" aria-hidden="true">›</span>
            </button>
          </li>
        </ul>
      </section>
    </template>

    <template v-else-if="hits.length > 0">
      <p class="count" role="status">{{ hits.length }} {{ hits.length === 1 ? 'guide' : 'guides' }}</p>
      <ul class="list" aria-label="Search results">
        <li v-for="hit in hits" :key="hit.guide.slug">
          <button type="button" class="item" @click="open(hit.guide.slug)">
            <span class="item-text">
              <span class="item-title">{{ hit.guide.title }}</span>
              <span class="item-caption">
                <template v-for="(part, i) in hit.excerpt" :key="i"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
              </span>
            </span>
            <span class="chevron" aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
    </template>

    <div v-else class="empty" role="status">
      <img class="empty-art mascot-art" :src="themeArt('clipboard')" alt="" width="120" height="120" />
      <p class="empty-title">No guide for that yet</p>
      <p class="empty-body">Ask us and we'll answer by email. Your question goes from your own email app.</p>
      <button type="button" class="btn-accent email" :disabled="sending" @click="emailSupport">Email support</button>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  width: 100%;
  max-width: 480px;
  height: min(88vh, var(--sheet-max-h, 88vh));
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(18px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sheet > * {
  flex-shrink: 0;
}

.sheet-top {
  position: sticky;
  top: -10px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: -10px;
  padding: 10px 0 8px;
  background: var(--bg);
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 2px;
}

.sheet-title {
  flex: 1;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

.sheet-back,
.sheet-close {
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.search {
  position: relative;
  display: block;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.search-icon {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
  pointer-events: none;
}

.search input {
  width: 100%;
  height: 46px;
  box-sizing: border-box;
  padding: 0 44px 0 40px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 1rem;
}

.search input:focus {
  border-color: var(--accent);
  outline: none;
}

.search input::-webkit-search-cancel-button {
  display: none;
}

.search-clear {
  position: absolute;
  right: 1px;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: grid;
  place-items: center;
}

.topic {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.topic-label {
  margin: 4px 2px 0;
  font-family: var(--font-body);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.list li + li {
  border-top: 1px solid var(--border);
}

.item {
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--text);
  text-align: left;
}

.item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-title {
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.25;
}

.item-caption {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-dim);
  line-height: 1.35;
}

.item-caption mark {
  background: color-mix(in srgb, var(--highlight) 30%, transparent);
  color: var(--text);
  border-radius: 3px;
  padding: 0 1px;
}

.chevron {
  color: var(--text-dim);
  font-size: 1.1rem;
}

.count {
  margin: 0 2px;
  font-size: 0.82rem;
  color: var(--text-dim);
}

.reader {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reader-title {
  margin: 2px 0 0;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1.1;
  color: var(--text);
}

.reader-lede {
  margin: 0;
  color: var(--text-dim);
  font-size: 0.92rem;
  line-height: 1.45;
}

.reader strong {
  color: var(--text);
  font-weight: 800;
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step {
  display: flex;
  gap: 11px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}

.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 0.82rem;
  flex-shrink: 0;
}

.step-body {
  min-width: 0;
}

.step-heading {
  margin: 3px 0 4px;
  font-family: var(--font-body);
  font-size: 0.96rem;
  font-weight: 800;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
}

.step-body p {
  margin: 0 0 6px;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.step-body p:last-child {
  margin-bottom: 0;
}

.step-body p.bullet {
  padding-left: 14px;
  position: relative;
}

.step-body p.bullet::before {
  content: '•';
  position: absolute;
  left: 2px;
}

.web-link {
  align-self: center;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  color: var(--secondary);
  font-weight: 800;
  font-size: 0.92rem;
  text-decoration: none;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 16px 8px 0;
}

.empty-art {
  width: 120px;
  height: 120px;
}

.empty-title {
  margin: 8px 0 0;
  font-weight: 800;
  font-size: 1.05rem;
  color: var(--text);
}

.empty-body {
  margin: 6px 0 16px;
  font-size: 0.88rem;
  color: var(--text-dim);
  line-height: 1.4;
}

.email {
  width: 100%;
}
</style>
