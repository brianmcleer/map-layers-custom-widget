/*
  Helpers for the Maps SDK list components (<arcgis-layer-list>, <arcgis-table-list>).

  The layer list and table list are web components. They replace the LayerList and
  TableList widget classes, which Esri deprecated in SDK 5.0 and scheduled for removal.
  A component draws inside its own shadow root, so three things the widget classes gave
  for free need help:

    1. Styles. The widget's CSS (lib/style.ts) cannot reach element or class selectors
       inside a shadow root. LIST_SHADOW_CSS carries those rules in; CSS custom
       properties set on .widget-layerlist still inherit and need nothing.
    2. Clicks. An event that starts inside a shadow root reports the component as its
       target. findOptionAction reads the real path instead.
    3. Popper anchors. A jimu-ui Popper cannot use an element inside a shadow root as
       its reference. OptionAnchorManager keeps an invisible stand-in on the page, laid
       over the real button.

  This follows what Esri's own Map Layers widget does in Experience Builder 1.21.
*/

/** Element and class rules from lib/style.ts that have to live inside the shadow root. */
export const LIST_SHADOW_CSS = `
calcite-flow calcite-flow-item {
  background: transparent;
  /* Hover background border radius */
  --calcite-corner-radius-sharp: 0;
}
calcite-action {
  /* Disabled Legend button's background */
  --calcite-color-foreground-1: transparent;
}
calcite-list-item {
  --calcite-color-foreground-3: rgba(0, 0, 0, 0.2);
}
.esri-layer-list__item-message {
  /* For empty warning message and icon */
  --calcite-notice-content-text-color: var(--sys-color-surface-overlay-text);
  font-family: var(--calcite-font-family);
}
.esri-legend__layer-cell {
  font-family: var(--calcite-font-family);
  font-size: var(--calcite-font-size--2);
}
.esri-layer-list__item-action {
  outline-offset: -2px;
}
`

/** Adds LIST_SHADOW_CSS to a list component's shadow root, once. Best-effort. */
export function styleListShadowRoot (root: any): void {
  try {
    if (!root || root.__mlcStyled) return
    root.__mlcStyled = true
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(LIST_SHADOW_CSS)
      root.adoptedStyleSheets = [...(root.adoptedStyleSheets || []), sheet]
    } catch (e) {
      const style = document.createElement('style')
      style.textContent = LIST_SHADOW_CSS
      root.appendChild(style)
    }
  } catch (e) { /* styling is best-effort */ }
}

/**
 * Colors the visibility check box (tick-box mode) inside the layer list's shadow root.
 * In lib/style.ts this was the .esri-layer-list__visible-toggle rule.
 */
export function applyVisibleToggleColor (root: ParentNode, useTickBoxes: boolean): void {
  try {
    const color = 'var(--sys-color-action-selected)'
    root.querySelectorAll<HTMLElement>('calcite-action.esri-layer-list__visible-toggle').forEach((el) => {
      if (useTickBoxes) {
        el.style.color = color
        el.style.setProperty('--calcite-icon-color', color)
        el.style.setProperty('--calcite-action-text-color', color)
        el.style.setProperty('--calcite-color-text-1', color)
      } else {
        el.style.removeProperty('color')
        el.style.removeProperty('--calcite-icon-color')
        el.style.removeProperty('--calcite-action-text-color')
        el.style.removeProperty('--calcite-color-text-1')
      }
    })
  } catch (e) { /* styling is best-effort */ }
}

/** The elements a click passed through, innermost first, including those inside shadow roots. */
export function eventPath (evt: any): any[] {
  const native = evt?.nativeEvent || evt
  const path = typeof native?.composedPath === 'function' ? native.composedPath() : []
  return path.length ? path : [native?.target]
}

/**
 * Finds the calcite-action (and the button inside it) a click landed on. Reads the
 * composed path first, because a click inside a shadow root reports the list
 * component, not the action, as its target.
 */
export function findClickedAction (evt: any): { actionElement: HTMLElement | null, buttonElement: HTMLElement | null } {
  let actionElement: HTMLElement | null = null
  let buttonElement: HTMLElement | null = null
  if (typeof evt?.composedPath === 'function') {
    for (const node of evt.composedPath()) {
      if (!(node instanceof HTMLElement)) continue
      if (!buttonElement && node.tagName === 'BUTTON') buttonElement = node
      if (!actionElement && node.tagName === 'CALCITE-ACTION') actionElement = node
    }
    if (actionElement) return { actionElement, buttonElement }
  }
  const target = evt?.target as HTMLElement | null
  if (!target) return { actionElement: null, buttonElement: null }
  actionElement = target.tagName === 'CALCITE-ACTION' ? target : target.closest('calcite-action')
  buttonElement = target.tagName === 'BUTTON' ? target : target.closest('button')
  return { actionElement, buttonElement }
}

/** The clickable button inside a calcite-action, used as the Popper anchor. */
export function innerActionButton (actionElement: HTMLElement | null): HTMLElement | null {
  if (!actionElement) return null
  const root = actionElement.shadowRoot
  return root ? root.querySelector<HTMLElement>('button[aria-label="Options"], button[part="button"], button') : null
}

/**
 * Keeps a Popper anchor for a button that sits inside a shadow root. When the button
 * is in a shadow root, ensure() returns an invisible fixed-position stand-in on the
 * page that tracks the button's box; otherwise it returns the button itself.
 */
export class OptionAnchorManager {
  private sourceRef: HTMLElement | null = null
  private proxyRef: HTMLElement | null = null
  private ownerDocumentRef: Document | null = null
  private ownerWindowRef: Window | null = null
  private resizeObserverRef: ResizeObserver | null = null

  /** The real button the anchor stands in for. */
  get sourceAnchor (): HTMLElement | null {
    return this.sourceRef
  }

  private readonly syncProxyRect = (): void => {
    if (!this.sourceRef || !this.proxyRef) return
    const rect = this.sourceRef.getBoundingClientRect()
    this.proxyRef.style.left = `${rect.left}px`
    this.proxyRef.style.top = `${rect.top}px`
    this.proxyRef.style.width = `${rect.width}px`
    this.proxyRef.style.height = `${rect.height}px`
  }

  cleanup (): void {
    this.resizeObserverRef?.disconnect()
    this.resizeObserverRef = null
    this.ownerWindowRef?.removeEventListener('resize', this.syncProxyRect)
    this.ownerDocumentRef?.removeEventListener('scroll', this.syncProxyRect, true)
    this.proxyRef?.remove()
    this.proxyRef = null
    this.sourceRef = null
    this.ownerDocumentRef = null
    this.ownerWindowRef = null
  }

  ensure (source: HTMLElement | null): HTMLElement | null {
    if (!source) {
      this.cleanup()
      return null
    }
    const rootNode = source.getRootNode?.()
    const inShadowRoot = !!rootNode && typeof ShadowRoot !== 'undefined' && rootNode instanceof ShadowRoot
    if (!inShadowRoot) {
      this.cleanup()
      this.sourceRef = source
      return source
    }
    const ownerDocument = source.ownerDocument || document
    const ownerWindow = ownerDocument.defaultView || window
    if (this.proxyRef && this.ownerDocumentRef === ownerDocument) {
      // Reuse the stand-in; only the listeners move to the new button.
      this.resizeObserverRef?.disconnect()
      this.ownerWindowRef?.removeEventListener('resize', this.syncProxyRect)
      this.ownerDocumentRef?.removeEventListener('scroll', this.syncProxyRect, true)
    } else {
      this.cleanup()
      this.proxyRef = ownerDocument.createElement('div')
      this.proxyRef.className = 'map-layers-option-action-anchor'
      this.proxyRef.style.position = 'fixed'
      this.proxyRef.style.pointerEvents = 'none'
      this.proxyRef.style.opacity = '0'
      this.proxyRef.style.zIndex = '-1'
      ownerDocument.body.appendChild(this.proxyRef)
    }
    this.sourceRef = source
    this.ownerDocumentRef = ownerDocument
    this.ownerWindowRef = ownerWindow
    this.syncProxyRect()
    ownerWindow.addEventListener('resize', this.syncProxyRect)
    ownerDocument.addEventListener('scroll', this.syncProxyRect, true)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserverRef = new ResizeObserver(() => { this.syncProxyRect() })
      this.resizeObserverRef.observe(source)
    }
    return this.proxyRef
  }

  /** Whether a click's coordinates fall on the real button. */
  isClickInsideCurrentOptionAnchor (evt: any): boolean {
    if (!evt || !this.sourceRef) return false
    const native = evt?.nativeEvent || evt
    const x = native?.clientX
    const y = native?.clientY
    if (typeof x !== 'number' || typeof y !== 'number') return false
    const rect = this.sourceRef.getBoundingClientRect()
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }
}
