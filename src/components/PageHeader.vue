<script setup lang="ts">
import AccountButton from './AccountButton.vue'

// Issue #65: one title row for every top-level screen -- the large display
// title with the Account button right-aligned beside it, replacing App.vue's
// Account-only row above the title. Screens that render this are listed in
// App.vue's OWN_HEADER_VIEWS so that row stays hidden there. The `before`
// slot holds anything that leads the title (MuscleDetail's badge). Issue
// #276: the `title` slot replaces the plain heading when the title needs
// more (TemplateEditor's rename button); the slot's markup styles itself.
defineProps<{ title?: string }>()
</script>

<template>
  <div class="page-header">
    <slot name="before" />
    <slot name="title"><h2 class="page-title">{{ title }}</h2></slot>
    <AccountButton />
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  /* Same as WorkoutLogger's active-workout row, so Account doesn't move
     when a workout starts. */
  padding-top: 16px;
  margin-bottom: 12px;
}

/* Under a back link the link row already spaces it from the top. */
.back-link + .page-header {
  padding-top: 0;
}

.page-header .page-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
