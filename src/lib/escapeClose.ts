import { Fragment, getCurrentInstance, onBeforeUnmount, onMounted, type ComponentInternalInstance } from 'vue'

// Issue #783: Android's back gesture closes the topmost [role="dialog"] by
// sending it an Escape keydown (androidBack.ts), so every sheet has to close
// on Escape or back does nothing. This is that rule in one place: a sheet
// calls useEscapeClose(close) and it closes only when its own dialog is the
// topmost one, so a sheet stacked on top of another one is closed alone.
//
// Issue #960: ownership is read from the DOM. It used to walk the
// component's vnode tree for the dialog's element, but a production build
// only keeps `el` on a re-rendered tree's dynamic nodes, so the walk could
// miss the dialog and the sheet ignored Escape and back in the store builds
// (the e2e suite ran on the dev server then, which keeps them all). Now the
// owner is the registered sheet whose root (for a multi-root sheet, its
// top-level node) is the innermost one holding the dialog, so a sheet nested
// inside another one's DOM closes alone.
const sheets = new Set<ComponentInternalInstance>()

// The node of the sheet's own root (its element, or one of a multi-root
// sheet's top-level nodes) that holds the dialog, or null.
function holderOf(instance: ComponentInternalInstance, dialog: Element): Node | null {
  const tree = instance.subTree
  // A sheet whose root is a child component (ThemeSheet showing ExtrasPicker)
  // doesn't own that component's dialog; the child, when it registers, does.
  if (tree.component || !tree.el) return null
  if (tree.type !== Fragment) return (tree.el as Node).contains(dialog) ? (tree.el as Node) : null
  for (let node: Node | null = tree.el as Node; node; node = node.nextSibling) {
    if (node.contains(dialog)) return node
    if (node === tree.anchor) break
  }
  return null
}

function ownerOf(dialog: Element): ComponentInternalInstance | null {
  let owner: ComponentInternalInstance | null = null
  let ownerHolder: Node | null = null
  for (const sheet of sheets) {
    const holder = holderOf(sheet, dialog)
    if (holder && (!ownerHolder || ownerHolder.contains(holder))) {
      owner = sheet
      ownerHolder = holder
    }
  }
  return owner
}

export function useEscapeClose(close: () => void) {
  const instance = getCurrentInstance()
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented || !instance) return
    const dialogs = document.querySelectorAll('[role="dialog"]')
    const top = dialogs[dialogs.length - 1]
    if (!top || ownerOf(top) !== instance) return
    event.preventDefault()
    close()
  }
  onMounted(() => {
    if (instance) sheets.add(instance)
    document.addEventListener('keydown', onKeydown)
  })
  onBeforeUnmount(() => {
    if (instance) sheets.delete(instance)
    document.removeEventListener('keydown', onKeydown)
  })
}
