import { computed, onMounted, onUnmounted, ref } from 'vue'

// The on-screen keyboard shrinks only the visual viewport on Android Chrome
// and iOS Safari, so a fixed bottom sheet's lower part (and its main button)
// ends up behind it. Bind `overlayStyle` to the sheet's fixed overlay to lift
// it above the keyboard, and cap the sheet with `sheetStyle` (or the
// `--sheet-max-h` variable the overlay carries, for sheets in child
// components). Both are empty where visualViewport isn't supported.
export function useKeyboardViewport(ratio = 0.92) {
  const viewport = ref<{ inset: number; height: number } | null>(null)

  function sync() {
    const vv = window.visualViewport
    if (!vv) return
    viewport.value = { inset: Math.max(0, window.innerHeight - vv.height - vv.offsetTop), height: vv.height }
  }

  onMounted(() => {
    sync()
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
  })
  onUnmounted(() => {
    window.visualViewport?.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('scroll', sync)
  })

  const maxHeight = computed(() => (viewport.value ? `${Math.round(viewport.value.height * ratio)}px` : ''))
  const overlayStyle = computed((): Record<string, string> => {
    if (!viewport.value) return {}
    return { bottom: `${viewport.value.inset}px`, '--sheet-max-h': maxHeight.value }
  })
  const sheetStyle = computed((): Record<string, string> => (maxHeight.value ? { maxHeight: maxHeight.value } : {}))
  return { overlayStyle, sheetStyle }
}
