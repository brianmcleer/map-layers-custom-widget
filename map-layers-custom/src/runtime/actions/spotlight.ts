import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'

const getView = (widget: any): any => {
  return widget.viewFromMapWidget || widget.jmvFromMap?.view
}

// Children of a node. A GroupLayer exposes its children on .layers; a map
// service (MapImageLayer / WMSLayer / etc.) and a group Sublayer expose theirs
// on .sublayers. Walking both lets us isolate individual SUBLAYERS of a service
// — which is what "Development Map" really is.
const childrenOf = (node: any): any => {
  if (node && node.layers && typeof node.layers.forEach === 'function') return node.layers
  if (node && node.sublayers && typeof node.sublayers.forEach === 'function') return node.sublayers
  return null
}

// Snapshot / restore the expanded-vs-collapsed state of the layer-list tree,
// keyed by each item's layer uid (stable for the session). Focus toggles
// visibility, which collapses groups; without this the tree comes back collapsed.
const snapshotOpenStates = (items: any, store: Map<any, boolean>): void => {
  if (!items || typeof items.forEach !== 'function') return
  items.forEach((item: any) => {
    const key = item && item.layer && item.layer.uid
    if (key != null) store.set(key, !!item.open)
    if (item && item.children && item.children.length) snapshotOpenStates(item.children, store)
  })
}

const restoreOpenStates = (items: any, store: Map<any, boolean>): void => {
  if (!items || typeof items.forEach !== 'function' || !store) return
  items.forEach((item: any) => {
    const key = item && item.layer && item.layer.uid
    if (key != null && store.has(key)) {
      const want = store.get(key)
      if (item.open !== want) { try { item.open = want } catch (e) { /* noop */ } }
    }
    if (item && item.children && item.children.length) restoreOpenStates(item.children, store)
  })
}

// Restore every node (layer OR sublayer) to the visibility it had before the
// spotlight, restore the tree's expanded/collapsed state, and clear the focus
// banner. Shared by Spotlight + Clear Spotlight + the banner's Exit button.
// Safe to call when nothing is spotlighted.
export const restoreSpotlight = (widget: any, opts?: { deferOverlayDismiss?: boolean }): void => {
  const deferOverlay = !!(opts && opts.deferOverlayDismiss)
  const backup: Map<any, boolean> = widget._spotlightVisBackup
  const openBackup: Map<any, boolean> = widget._spotlightOpenBackup
  // Suppress the visibility watcher's open/collapse coupling: restoring layer
  // visibility fires async watch callbacks that would otherwise overwrite the
  // tree's expand state. Hold this flag until those callbacks have settled.
  widget._spotlightAdjusting = true

  if (backup && backup.size > 0) {
    backup.forEach((vis: boolean, node: any) => {
      try { if (node && typeof node.visible === 'boolean') node.visible = vis } catch (e) { /* noop */ }
    })
    backup.clear()
  }

  const applyOpen = () => {
    try {
      const ll = widget.layerListRef && widget.layerListRef.current
      if (openBackup && ll && ll.operationalItems) restoreOpenStates(ll.operationalItems, openBackup)
    } catch (e) { /* noop */ }
  }
  // Re-apply on every animation frame across the settle window. Running each
  // frame (~16ms) means if the dismiss-triggered rebuild momentarily collapses
  // an item, it is re-expanded before the next paint — so it is never visible.
  // "set only if different" keeps these frames free of any redundant churn.
  const REVEAL_AT_MS = 800   // tree is settled behind the overlay by here
  const END_AT_MS = 1600     // keep correcting ~800ms past the reveal, then stop
  const raf: (cb: any) => any = (typeof window !== 'undefined' && window.requestAnimationFrame)
    ? window.requestAnimationFrame.bind(window)
    : ((cb: any) => window.setTimeout(cb, 16))
  const start = Date.now()
  let revealed = false
  applyOpen()
  const loop = () => {
    applyOpen()
    const elapsed = Date.now() - start
    if (!revealed && deferOverlay && elapsed >= REVEAL_AT_MS) {
      revealed = true
      try { if (typeof widget.setState === 'function') widget.setState({ spotlightLayerName: null, spotlightExiting: false }) } catch (e) { /* noop */ }
    }
    if (elapsed < END_AT_MS) {
      raf(loop)
    } else {
      widget._spotlightAdjusting = false
      if (widget._spotlightOpenBackup === openBackup) widget._spotlightOpenBackup = null
    }
  }
  raf(loop)

  widget._spotlightLayerId = null
  // When not deferring (e.g. switching focus targets), clear immediately.
  if (!deferOverlay) {
    try { if (typeof widget.setState === 'function') widget.setState({ spotlightLayerName: null }) } catch (e) { /* noop */ }
  }
}

// "Spotlight" = ISOLATE: show only the chosen layer/sublayer (plus its parent
// groups so it can render) and hide everything else. Works on real layers AND
// on the sublayers of a map service. Sticky: stays until exited.
export default class Spotlight extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'spotlight-layer'
    this.title = title
    this.className = 'esri-icon-lightbulb'
    this.group = ACTION_INDEXES.Spotlight
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (isTableList) return false
    if (!this.useMapWidget() || !this.widget.props.config.extraLayerTools || this.widget.props.config.toolSpotlight === false) return false
    const layer: any = layerItem && layerItem.layer
    return !!layer && typeof layer.visible === 'boolean'
  }

  execute = (layerItem): void => {
    const w: any = this.widget
    const view = getView(w)
    const target: any = layerItem && layerItem.layer
    if (!view || !view.map || !target) return

    // Always start clean so switching targets restores first.
    restoreSpotlight(w)

    // Remember how the tree is expanded/collapsed so exiting focus can put it
    // back exactly as it was.
    const layerList = w.layerListRef && w.layerListRef.current
    if (layerList && layerList.operationalItems) {
      const openBackup = new Map<any, boolean>()
      snapshotOpenStates(layerList.operationalItems, openBackup)
      w._spotlightOpenBackup = openBackup
    }

    const map = view.map

    // Build the full node tree (layers AND sublayers) with parent links.
    const parentOf = new Map<any, any>()
    const allNodes: any[] = []
    const index = (node: any, parent: any) => {
      allNodes.push(node)
      if (parent) parentOf.set(node, parent)
      const kids = childrenOf(node)
      if (kids) kids.forEach((k: any) => { index(k, node) })
    }
    if (map.layers && map.layers.forEach) map.layers.forEach((l: any) => { index(l, null) })

    // Resolve the clicked node inside the tree: object identity first, then by
    // id + type (covers cases where the list hands us a different reference).
    let targetNode: any = null
    if (allNodes.indexOf(target) >= 0) targetNode = target
    if (!targetNode) {
      for (const n of allNodes) {
        if (n && n.id === target.id && n.declaredClass === target.declaredClass) { targetNode = n; break }
      }
    }
    if (!targetNode) targetNode = target

    // keep = the node, everything inside it, and all of its parent groups.
    const keep = new Set<any>()
    const addSelfAndDescendants = (node: any) => {
      keep.add(node)
      const kids = childrenOf(node)
      if (kids) kids.forEach(addSelfAndDescendants)
    }
    addSelfAndDescendants(targetNode)
    // The target's ancestor chain — the only containers we are allowed to force ON.
    const ancestors = new Set<any>()
    let p: any = parentOf.get(targetNode)
    while (p) { keep.add(p); ancestors.add(p); p = parentOf.get(p) }

    const hasChildren = (n: any): boolean => {
      const kids = childrenOf(n)
      return !!(kids && kids.length > 0)
    }

    // Apply isolation by toggling ONLY leaf layers/sublayers. Group containers
    // are left untouched — except the target's own ancestor chain, which we
    // force ON so the focused layer can render. A container we never touch keeps
    // its visibility AND its expand/collapse state, so the tree no longer
    // collapses on entering or leaving focus. Only changed nodes are backed up.
    const backup = new Map<any, boolean>()
    w._spotlightVisBackup = backup
    allNodes.forEach((n: any) => {
      if (!n || typeof n.visible !== 'boolean') return
      if (hasChildren(n)) {
        // Container: only force ancestors of the target (incl. the target if it
        // is itself a group) ON. Never switch any container OFF.
        if ((ancestors.has(n) || n === targetNode) && n.visible !== true) {
          if (!backup.has(n)) backup.set(n, n.visible)
          try { n.visible = true } catch (e) { /* noop */ }
        }
      } else {
        // Leaf: ON only if it is on the kept branch, else OFF.
        const want = keep.has(n)
        if (n.visible !== want) {
          if (!backup.has(n)) backup.set(n, n.visible)
          try { n.visible = want } catch (e) { /* noop */ }
        }
      }
    })

    w._spotlightLayerId = targetNode.id
    const name = targetNode.title || target.title || 'this layer'
    try { if (typeof w.setState === 'function') w.setState({ spotlightLayerName: name }) } catch (e) { /* noop */ }

    // Cover the enter-time list rebuild: while this flag is up, items recreated
    // by the rebuild restore their expand state at creation (in the widget's
    // listItemCreatedFunction), so expanded groups never flash collapsed.
    w._spotlightAdjusting = true
    window.setTimeout(() => { w._spotlightAdjusting = false }, 800)
  }
}
