<script setup lang="ts">
// Issue #462: a tier the imported history crossed reads "Before RepBunny".
// Issue #153: Milestones, opened from the Progress hub. One card per track:
// the count so far, progress to the next tier and what it unlocks, and every
// tier as a chip. Counts come from history every time; a tier this device has
// already shown stays unlocked even if deletes lower the count.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { clearIntro, countText, tierRewardLabel, trackProgress } from '../lib/milestones'
import { useMilestoneState } from '../lib/milestoneState'
import { isPremium, showPremiumNudges } from '../lib/premium'
import { currentTrial, openTrialSheet, trialFeatureLabel, unusedPassCount } from '../lib/trialPass'
import { TRIAL_USE, goToTrialFeature, trialGuideUrl } from '../lib/trialUse'
import TrialNote from './TrialNote.vue'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'

const { ready, counts, seen, intro, importedTiers } = useMilestoneState()
const router = useRouter()

// Issue #489: where the running trial's feature lives.
const trialUse = computed(() => (currentTrial.value ? TRIAL_USE[currentTrial.value.feature] : null))

const tracks = computed(() => trackProgress(counts.value, seen.value))

function dismissIntro() {
  clearIntro()
  intro.value = null
}

// A tier shown in a celebration on this device is earned here, whatever crossed it.
function beforeRepBunny(id: string): boolean {
  return importedTiers.value.has(id) && !seen.value.has(id)
}

function progressPct(count: number, next: number): number {
  return Math.min(100, Math.round((count / next) * 100))
}
</script>

<template>
  <div class="milestones">
    <router-link :to="{ name: 'progress' }" class="back-link" aria-label="Back to Progress"><span aria-hidden="true">‹</span>Progress</router-link>
    <PageHeader title="Milestones" />
    <p class="page-lede">Training unlocks them. Nothing to keep up, and nothing to lose.</p>

    <div v-if="intro" class="intro" role="status" data-testid="milestones-intro">
      <span class="carrot" aria-hidden="true" />
      <p>{{ intro }}</p>
      <button type="button" class="ghost small" @click="dismissIntro">Got it</button>
    </div>

    <!-- Issue #155: a free user's trial passes, and the one running. -->
    <section
      v-if="showPremiumNudges && (currentTrial || unusedPassCount > 0)"
      class="trial-card"
      aria-labelledby="trial-card-title"
      data-testid="milestones-trial"
    >
      <h3 id="trial-card-title">Premium trial</h3>
      <template v-if="currentTrial">
        <p class="trial-line">{{ trialFeatureLabel(currentTrial.feature) }} is on. {{ trialUse?.where }}</p>
        <TrialNote :feature="currentTrial.feature" />
        <div v-if="trialUse" class="trial-use">
          <button v-if="trialUse.action" type="button" class="trial-pick" @click="goToTrialFeature(currentTrial.feature, router.push)">
            {{ trialUse.action.label }}
          </button>
          <a class="trial-guide" :href="trialGuideUrl(currentTrial.feature)" target="_blank" rel="noopener">{{ trialUse.guide.label }}</a>
        </div>
        <p v-if="unusedPassCount > 0" class="trial-line dim">
          {{ unusedPassCount === 1 ? 'Another pass waits' : `${unusedPassCount} more passes wait` }} until this one ends.
        </p>
      </template>
      <template v-else>
        <p class="trial-line">
          You have {{ unusedPassCount === 1 ? 'a trial pass' : `${unusedPassCount} trial passes` }}. Each one opens a
          Premium feature for 7 days.
        </p>
        <button type="button" class="trial-pick" @click="openTrialSheet">Pick a feature to try</button>
      </template>
    </section>

    <SkeletonRows v-if="!ready" :rows="3" />
    <template v-else>
      <section
        v-for="t in tracks"
        :key="t.info.track"
        class="track"
        :aria-labelledby="`track-${t.info.track}`"
        :data-testid="`milestone-track-${t.info.track}`"
      >
        <div class="track-head">
          <h3 :id="`track-${t.info.track}`">{{ t.info.title }}</h3>
          <span class="track-count">{{ countText(t.info.track, t.count) }}</span>
        </div>
        <template v-if="t.next">
          <p class="next" data-testid="milestone-next">
            {{ t.count.toLocaleString('en-US') }} of {{ countText(t.info.track, t.next.count) }}<template v-if="tierRewardLabel(t.next, isPremium)"> · unlocks {{ tierRewardLabel(t.next, isPremium) }}</template>
          </p>
          <div
            class="bar"
            role="progressbar"
            :aria-label="`${t.info.title}: progress to the next milestone`"
            aria-valuemin="0"
            :aria-valuemax="t.next.count"
            :aria-valuenow="Math.min(t.count, t.next.count)"
          >
            <span :style="{ width: `${progressPct(t.count, t.next.count)}%` }" />
          </div>
        </template>
        <p v-else class="next" data-testid="milestone-next">All unlocked. Nice work.</p>
        <ul class="tiers">
          <li
            v-for="tier in t.tiers"
            :key="tier.id"
            class="tier"
            :class="{ unlocked: tier.unlocked }"
            :data-testid="`milestone-tier-${tier.id}`"
            :data-unlocked="tier.unlocked"
          >
            <span v-if="tier.unlocked" class="carrot small" aria-hidden="true" />
            {{ tier.count.toLocaleString('en-US') }}
            <span v-if="tier.unlocked && beforeRepBunny(tier.id)" class="before" :data-testid="`milestone-before-${tier.id}`">Before RepBunny</span>
            <span class="sr-only">{{ tier.unlocked ? 'unlocked' : 'locked' }}</span>
          </li>
        </ul>
        <p class="rule">{{ t.info.rule }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: 2px;
}

.page-lede {
  margin: 0 0 16px;
  color: var(--text-dim);
  font-size: 0.84rem;
}

.intro {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--accent) 9%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  border-radius: 16px;
}

.intro p {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.intro button {
  flex-shrink: 0;
}

.carrot {
  flex-shrink: 0;
  display: inline-block;
  width: 26px;
  height: 26px;
  background: var(--decor-carrot) no-repeat center / contain;
}

.carrot.small {
  width: 14px;
  height: 14px;
}

.trial-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 14px;
  background: color-mix(in srgb, var(--secondary) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--secondary) 35%, var(--border));
  border-radius: 16px;
}

.trial-card h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
}

.trial-line {
  margin: 0;
  font-size: 0.88rem;
}

.trial-line.dim {
  color: var(--text-dim);
  font-size: 0.8rem;
}

.trial-pick {
  align-self: flex-start;
  min-height: 44px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.trial-use {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.trial-guide {
  color: var(--secondary);
  font-size: 0.85rem;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.track {
  margin-bottom: 12px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.track-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.track-head h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
}

.track-count {
  flex-shrink: 0;
  font-weight: 800;
  color: var(--accent);
}

.next {
  margin: 4px 0 8px;
  font-size: 0.85rem;
  color: var(--text-dim);
}

.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
}

.tiers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.tier {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 40px;
  justify-content: center;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 0.8rem;
  font-weight: 700;
}

.tier.unlocked {
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text);
}

.before {
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--text-dim);
}

.rule {
  margin: 10px 0 0;
  font-size: 0.78rem;
  color: var(--text-dim);
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
</style>
