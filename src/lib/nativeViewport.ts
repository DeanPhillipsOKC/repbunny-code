import { Capacitor } from '@capacitor/core'

export const NATIVE_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'

// Issue #825: a native app shouldn't zoom like a web page. The Log screen's
// `touch-action: pan-y` blocks pinching, so a zoomed-in view had no way back.
// The web build keeps its viewport, since people in a browser may rely on pinch zoom.
export function lockNativeViewport(doc: Document = document): void {
  if (!Capacitor.isNativePlatform()) return
  doc.querySelector('meta[name="viewport"]')?.setAttribute('content', NATIVE_VIEWPORT)
}
