import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

// Issue #842: with a few hundred library entries, the Add exercise sheet's
// unfiltered "From the library" list made the sheet slow to open. This renders
// the first screenful with the sheet and the rest two frames later, once the
// sheet is on screen. Same rows, same order; only when they mount changes.
export function useProgressiveList<T>(list: Ref<T[]>, first = 40) {
  const full = ref(false)
  let frame = 0
  onMounted(() => {
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => (full.value = true))
    })
  })
  onBeforeUnmount(() => cancelAnimationFrame(frame))
  return computed(() => (full.value ? list.value : list.value.slice(0, first)))
}
