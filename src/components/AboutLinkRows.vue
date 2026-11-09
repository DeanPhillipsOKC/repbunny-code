<script setup lang="ts">
import { storeListingUrl, shareApp } from '../lib/storeListing'
import './account-rows.css'

// The About group's outbound rows: Privacy policy and Support open the site in
// the browser, and (native apps only, issue #726) Rate RepBunny opens the store
// listing and Share RepBunny opens the system share sheet with its link.
const listing = storeListingUrl()
</script>

<template>
  <a class="data-item" href="https://repbunny.app/privacy/" target="_blank" rel="noopener">
    <span class="data-title">Privacy policy</span>
    <span class="data-chevron" aria-hidden="true">↗</span>
  </a>
  <a class="data-item" href="https://repbunny.app/support/" target="_blank" rel="noopener">
    <span class="data-title">Support</span>
    <span class="data-chevron" aria-hidden="true">↗</span>
  </a>
  <template v-if="listing">
    <a class="data-item" :href="listing" target="_blank" rel="noopener">
      <span class="data-title">Rate RepBunny</span>
      <span class="data-chevron" aria-hidden="true">↗</span>
    </a>
    <button type="button" class="data-item" @click="shareApp(listing)">
      <span class="data-title">Share RepBunny</span>
      <span class="data-chevron" aria-hidden="true">›</span>
    </button>
  </template>
</template>
