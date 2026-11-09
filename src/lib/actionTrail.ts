import type { Router } from 'vue-router'

// Issue #234: a short, in-memory trail of what the user did before an error,
// so a bug report shows the steps that led to it. Screen names and the labels
// of the buttons tapped, never what was typed: inputs are never read, digits
// in a label become "#" (weights, reps, dates), and any name the user owns
// (exercises, routines) is swapped for "[name]". Never stored or sent on its
// own; it rides along on a logged error. docs/architecture.md "Client error log".

export const TRAIL_LIMIT = 20
const LABEL_LIMIT = 40

const trail: string[] = []
let namesSource: () => Iterable<string> = () => []

// Where the user's own names come from (App.vue wires in the stores), so a
// tapped row that shows an exercise or routine name doesn't record it.
export function setTrailNames(source: () => Iterable<string>) {
  namesSource = source
}

export function recordAction(name: string) {
  if (!name) return
  if (trail.at(-1) === name) return
  trail.push(name)
  if (trail.length > TRAIL_LIMIT) trail.splice(0, trail.length - TRAIL_LIMIT)
}

export function actionTrail(): string[] {
  return [...trail]
}

export function clearActionTrail() {
  trail.length = 0
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function scrubLabel(label: string, names: Iterable<string> = namesSource()): string {
  let text = label.replace(/\s+/g, ' ').trim()
  const owned = [...names].map((n) => n.trim()).filter((n) => n.length > 1).sort((a, b) => b.length - a.length)
  for (const name of owned) text = text.replace(new RegExp(escapeRegExp(name), 'gi'), '[name]')
  text = text.replace(/\d+([.,:]\d+)*/g, '#')
  return text.length > LABEL_LIMIT ? `${text.slice(0, LABEL_LIMIT - 1)}…` : text
}

const CLICKABLE = 'button, a, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], input[type="checkbox"], input[type="radio"]'

// The accessible name a tap is recorded under: aria-label, else the
// element's visible text. A checkbox or radio uses its <label>'s text. Never
// an input's value.
export function labelFor(el: Element): string {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria
  if (el instanceof HTMLInputElement) {
    const label = el.labels?.[0]
    return label?.textContent ?? el.type
  }
  return el.textContent ?? ''
}

export function describeTap(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  const el = target.closest(CLICKABLE)
  if (!el) return null
  const label = scrubLabel(labelFor(el))
  return label ? `Tap "${label}"` : null
}

let installed = false

// Records each route change and each tap on something clickable. Capture
// phase, so a handler that stops propagation still gets recorded.
export function installActionTrail(router: Router) {
  if (installed) return
  installed = true
  router.afterEach((to) => {
    recordAction(`Screen ${String(to.name ?? to.path.split(/[?#]/)[0])}`)
  })
  document.addEventListener(
    'click',
    (event) => {
      try {
        const step = describeTap(event.target)
        if (step) recordAction(step)
      } catch {
        // The trail is a nice-to-have; never let it break a tap.
      }
    },
    true,
  )
}
