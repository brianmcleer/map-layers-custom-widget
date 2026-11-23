/*
  layer-bridge.ts  -  lets other widgets in the page work through this layer list.

  An assistant widget (Mappy) or any other widget can see the layer tree exactly as this list
  shows it (customize whitelist applied, display names, groups at any depth), switch layers on
  and off through the list's own rules (parents on, pick-one groups), and ask the list to
  reveal and flash a layer's row so the user sees the change where they expect it.

  Contract (version 2, compatible with version 1 consumers), plain browser globals:
    reveal selects the SDK row, opens its parents and clears temporary list filters.
    items includes configured table-list rows with isTable: true.
    window.__exbLayerLists[widgetId] = LayerListBridge
    window.dispatchEvent(new CustomEvent('exb-layer-list-change', { detail: { widgetId } }))
      fired when a list registers, unregisters or finishes building.

  No Experience Builder or Maps SDK imports: everything works on the list items it is handed.
*/

export const BRIDGE_KEY = '__exbLayerLists'
export const BRIDGE_EVENT = 'exb-layer-list-change'
export const BRIDGE_VERSION = 2

export interface BridgeItem {
  isTable?: boolean
  /** The Maps SDK layer or sublayer behind the row. */
  layer: any
  /** Name as the list shows it (translated or cleaned names applied, no marks). */
  title: string
  /** The web map name. */
  rawTitle: string
  /** Display names from the top of the list down, joined with " > ". */
  path: string
  depth: number
  isGroup: boolean
  /** The row's own tick box. */
  visible: boolean
  /** The row and every row above it ticked. */
  effective: boolean
  /** False when the SDK greys the row out at the current scale. */
  inScale: boolean
  /** Rows above, outermost first. */
  ancestors: any[]
  /** Pick-one (radio) group. */
  exclusive: boolean
  favorite: boolean
}

export interface ToggleResult { parents: string[], children: string[] }

export interface LayerListBridge {
  version: number
  widgetId: string
  label: string
  readonly ready: boolean
  readonly view: any
  readonly mapWidgetId: string | null
  /** The list host element, for "is the list on screen" checks. */
  readonly element: HTMLElement | null
  items: () => BridgeItem[]
  setVisible: (layer: any, on: boolean) => ToggleResult
  reveal: (layer: any) => boolean
  presets: () => Array<{ id: string, name: string }>
  applyPreset: (idOrName: string) => boolean
  favorites: () => string[]
}

const toArr = (c: any): any[] => (c ? (c.toArray ? c.toArray() : Array.isArray(c) ? c : []) : [])

function registry (): { [id: string]: LayerListBridge } {
  const w: any = typeof window !== 'undefined' ? window : {}
  if (!w[BRIDGE_KEY]) w[BRIDGE_KEY] = {}
  return w[BRIDGE_KEY]
}

export function notifyBridge (widgetId: string): void {
  try { window.dispatchEvent(new CustomEvent(BRIDGE_EVENT, { detail: { widgetId } })) } catch (e) { /* old browser */ }
}

export function registerBridge (b: LayerListBridge): void {
  registry()[b.widgetId] = b
  notifyBridge(b.widgetId)
}

export function unregisterBridge (widgetId: string): void {
  try { delete registry()[widgetId] } catch (e) { /* noop */ }
  notifyBridge(widgetId)
}

/** Strips the marks this list adds to titles (favorite star, unavailable note). */
export function plainTitle (title: string): string {
  return String(title || '').replace(/^\s*[★☆]\s*/, '').replace(/\s*\([^)]*\)\s*$/, (m) => /unavailable|not available|down/i.test(m) ? '' : m).trim()
}

/**
 * Rows exactly as the list shows them, top first. Hidden rows (customize whitelist,
 * listMode hide) and everything under them are left out.
 */
export function walkItems (operationalItems: any, opts: { titleOf?: (item: any) => string, scaleOf?: (item: any) => boolean, favorite?: (layer: any) => boolean } = {}): BridgeItem[] {
  const out: BridgeItem[] = []
  const walk = (items: any, anc: any[], names: string[], ancOn: boolean) => {
    for (const item of toArr(items)) {
      if (!item || item.hidden) continue
      const layer = item.layer
      const title = opts.titleOf ? opts.titleOf(item) : plainTitle(item.title || layer?.title || '')
      const kids = toArr(item.children).filter((k: any) => k && !k.hidden)
      const visible = item.visible !== false
      out.push({
        layer,
        title,
        rawTitle: String(layer?.title || title),
        path: [...names, title].join(' > '),
        depth: anc.length,
        isGroup: kids.length > 0,
        visible,
        effective: ancOn && visible,
        inScale: opts.scaleOf ? opts.scaleOf(item) : item.visibleAtCurrentScale !== false,
        ancestors: anc.map(a => a.layer).filter(Boolean),
        exclusive: layer?.visibilityMode === 'exclusive',
        favorite: opts.favorite ? !!opts.favorite(layer) : false
      })
      if (kids.length) walk(kids, [...anc, item], [...names, title], ancOn && visible)
    }
  }
  walk(operationalItems, [], [], true)
  return out
}

export function findItem (items: any, layer: any): any {
  for (const item of toArr(items)) {
    if (!item) continue
    if (item.layer === layer) return item
    const hit = findItem(item.children, layer)
    if (hit) return hit
  }
  return null
}

/**
 * Switches a row through the list items, the way a click does: on also ticks every row
 * above it, and a group with nothing ticked inside gets its rows ticked (only the top one
 * in a pick-one group). Off unticks just that row.
 */
export function setItemVisible (operationalItems: any, layer: any, on: boolean, parentOf?: (layer: any) => any): ToggleResult {
  const res: ToggleResult = { parents: [], children: [] }
  const item = findItem(operationalItems, layer)
  const set = (target: any, v: boolean) => {
    try {
      if (target && typeof target.visible === 'boolean') target.visible = v
    } catch (e) { /* not switchable */ }
  }
  if (!item) { set(layer, on); return res }
  if (!on) { set(item, false); return res }
  let p: any = item.parent
  const chain: any[] = []
  while (p) { chain.unshift(p); p = p.parent }
  for (const a of chain) {
    if (a.visible === false) { set(a, true); res.parents.push(plainTitle(a.title || a.layer?.title || '')) }
    a.open = true
  }
  // Container layers the list does not show as rows (hidden groups above).
  if (parentOf) {
    let up = parentOf(layer)
    while (up) {
      if (up.visible === false) { set(up, true); res.parents.push(String(up.title || 'group')) }
      up = parentOf(up)
    }
  }
  set(item, true)
  const kids = toArr(item.children).filter((k: any) => k && !k.hidden)
  if (kids.length) {
    item.open = true
    if (!kids.some((k: any) => k.visible)) {
      const exclusive = layer?.visibilityMode === 'exclusive'
      for (const k of exclusive ? kids.slice(0, 1) : kids) { set(k, true); res.children.push(plainTitle(k.title || k.layer?.title || '')) }
    }
  }
  return res
}

/** Opens every row above the layer's row (and the row itself for a group). */
export function openToItem (operationalItems: any, layer: any): any {
  const item = findItem(operationalItems, layer)
  if (!item) return null
  let p: any = item.parent
  while (p) { p.open = true; p = p.parent }
  item.open = true
  return item
}

/** Select through the SDK collection without clicking its visibility checkbox. */
export function selectItem (list: any, item: any): boolean {
  if (!list || !item) return false
  try {
    if (list.selectionMode === 'none' || !list.selectionMode) list.selectionMode = 'single'
    const selected = list.selectedItems
    if (selected?.removeAll && selected?.add) { selected.removeAll(); selected.add(item); return true }
    return false
  } catch (e) { return false }
}

/**
 * Finds the rendered row for a list item, scrolls it into view and draws a short orange
 * highlight over that one row (not the group around it). Rows with the same name in
 * different groups, and a group and a layer that share a name (a map service called Parcels
 * holding a Parcels sublayer), are told apart by the names of the rows above them and by
 * depth. Returns false when the row is not rendered yet.
 */
const ROW_SEL = 'calcite-list-item, li.esri-layer-list__item, [role="treeitem"]'

export function flashRow (host: HTMLElement | null, item: any): boolean {
  if (!host || !item) return false
  const want = plainTitle(item.title || item.layer?.title || '')
  const chain: string[] = []
  let p: any = item.parent
  while (p) { chain.unshift(plainTitle(p.title || p.layer?.title || '')); p = p.parent }
  // The list components draw their rows inside their own shadow roots, which
  // querySelectorAll on the host does not enter. Search those roots too.
  const roots: ParentNode[] = [host]
  host.querySelectorAll('arcgis-layer-list, arcgis-table-list').forEach((el) => { if (el.shadowRoot) roots.push(el.shadowRoot) })
  const within = (el: Node): boolean => roots.some(root => root.contains(el))
  const rows: HTMLElement[] = []
  roots.forEach((root) => { rows.push(...(Array.from(root.querySelectorAll(ROW_SEL)) as HTMLElement[])) })
  const labelOf = (el: HTMLElement): string => plainTitle(String((el as any).label || el.getAttribute('label') || el.getAttribute('aria-label') || (el.textContent || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || ''))
  const ancestorsOf = (el: HTMLElement): string[] => {
    const names: string[] = []
    let up = el.parentElement ? el.parentElement.closest(ROW_SEL) as HTMLElement : null
    while (up && within(up)) { names.unshift(labelOf(up)); up = up.parentElement ? up.parentElement.closest(ROW_SEL) as HTMLElement : null }
    return names
  }
  const matches = rows.filter(el => labelOf(el) === want)
  if (!matches.length) return false
  const row =
    matches.find(el => ancestorsOf(el).join('>') === chain.join('>')) ||
    matches.find(el => ancestorsOf(el).length === chain.length) ||
    matches.sort((x, y) => ancestorsOf(y).length - ancestorsOf(x).length)[0]
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  try { row.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }) } catch (e) { row.scrollIntoView() }
  highlightRow(row)
  return true
}

/** The row's own line: the shadow container of a Calcite list item, or the row box above its nested rows. */
function rowBox (row: HTMLElement): DOMRect {
  const sr: any = (row as any).shadowRoot
  const inner: HTMLElement | null = sr ? (sr.querySelector('.container, [class*="container"], tr, .row') as HTMLElement | null) : null
  if (inner) {
    const r = inner.getBoundingClientRect()
    if (r.height > 4) return r
  }
  const r = row.getBoundingClientRect()
  const child = row.querySelector(ROW_SEL) as HTMLElement | null
  if (child) {
    const c = child.getBoundingClientRect()
    if (c.top > r.top + 4) return new DOMRect(r.left, r.top, r.width, c.top - r.top)
  }
  return r
}

/** An orange box drawn over one row for about 2.5 seconds; follows the row while the list scrolls. */
export function highlightRow (row: HTMLElement): void {
  try {
    const box = document.createElement('div')
    box.setAttribute('aria-hidden', 'true')
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147482999;border:3px solid #e67700;border-radius:4px;background:rgba(230,119,0,0.14);box-shadow:0 0 0 3px rgba(255,255,255,0.85);transition:opacity .4s ease;opacity:1'
    document.body.appendChild(box)
    const start = Date.now()
    const tick = () => {
      if (!document.body.contains(box)) return
      const r = rowBox(row)
      box.style.left = r.left + 'px'
      box.style.top = r.top + 'px'
      box.style.width = r.width + 'px'
      box.style.height = r.height + 'px'
      box.style.display = r.width > 0 && r.height > 0 && document.contains(row) ? 'block' : 'none'
      const t = Date.now() - start
      if (t > 2400) box.style.opacity = '0'
      if (t > 2900) { box.remove(); return }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  } catch (e) { /* drawing the highlight is best effort */ }
}

/**
 * A preset names the switchable layers that are on; every other switchable layer goes off.
 * Same rule as the Views menu: group layers keep their state, parents of wanted layers go on.
 */
export function applyPresetToMap (map: any, layerIds: string[], autoShowParents: boolean): void {
  if (!map?.allLayers) return
  const wanted = new Set<string>(layerIds.map(String))
  const parent = new Map<any, any>()
  const walk = (layers: any, p: any) => { for (const l of toArr(layers)) { if (p) parent.set(l, p); if (l && l.layers) walk(l.layers, l) } }
  walk(map.layers, null)
  map.allLayers.forEach((layer: any) => {
    if (!layer || layer.id == null || typeof layer.visible !== 'boolean') return
    if (layer.listMode === 'hide' || layer.declaredClass === 'esri.layers.GroupLayer') return
    layer.visible = wanted.has(String(layer.id))
    if (layer.visible && autoShowParents) {
      let p = parent.get(layer)
      while (p) { if (p.visible !== true) p.visible = true; p = parent.get(p) }
    }
  })
}

export function buildParentMap (map: any): Map<any, any> {
  const parent = new Map<any, any>()
  const walk = (layers: any, p: any) => { for (const l of toArr(layers)) { if (p) parent.set(l, p); if (l && l.layers) walk(l.layers, l) } }
  if (map) walk(map.layers, null)
  return parent
}
