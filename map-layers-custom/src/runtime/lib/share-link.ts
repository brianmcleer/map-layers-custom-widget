/*
  share-link.ts  -  layer state in the URL.

  The link carries one query parameter, `mlc`, holding the ids of the layers that are on,
  comma separated and URL encoded. Only layers a user can switch on or off are listed (no
  group layers, no hidden layers), matching the header's visible-layer count. Reading is
  one-shot on load: layers named in the parameter are switched on, every other switchable
  layer is switched off, and ids the map does not have are ignored, so a link made in one
  app does no harm in another. The address bar is never rewritten by the widget.

  Pure functions, no Experience Builder imports, so tests/share-link.test.cjs can run them
  in plain Node.
*/

export const SHARE_PARAM = 'mlc'

/** True for a layer the user can switch on or off in the list (same rule as the count badge). */
export function isSwitchableLayer (layer: any): boolean {
  if (!layer) return false
  if (layer.listMode === 'hide') return false
  if (layer.declaredClass === 'esri.layers.GroupLayer') return false
  return typeof layer.visible === 'boolean' && layer.id != null
}

/** Ids of the switchable layers that are on, in map order. */
export function visibleLayerIds (allLayers: any): string[] {
  const ids: string[] = []
  if (!allLayers) return ids
  const each = (fn: (l: any) => void): void => {
    if (typeof allLayers.forEach === 'function') allLayers.forEach(fn)
    else if (Array.isArray(allLayers)) allLayers.forEach(fn)
  }
  each((layer: any) => {
    if (isSwitchableLayer(layer) && layer.visible) ids.push(String(layer.id))
  })
  return ids
}

/** Encodes ids for the parameter value. Commas inside an id are escaped so the split is safe. */
export function encodeIds (ids: string[]): string {
  return ids.map((id: string) => encodeURIComponent(id)).join(',')
}

export function decodeIds (value: string | null | undefined): string[] {
  if (!value) return []
  return value.split(',').map((p: string) => {
    try { return decodeURIComponent(p) } catch (e) { return p }
  }).filter((p: string) => p.length > 0)
}

/** The current page address with the `mlc` parameter set to `ids`; other parameters are kept. */
export function buildShareLink (href: string, ids: string[]): string {
  const url = new URL(href)
  url.searchParams.set(SHARE_PARAM, encodeIds(ids))
  // URLSearchParams re-encodes the commas; keep them readable.
  return url.toString().replace(/%2C/g, ',')
}

/** Ids named in the page address, or null when the parameter is absent. */
export function readShareIds (search: string): string[] | null {
  try {
    const params = new URLSearchParams(search || '')
    if (!params.has(SHARE_PARAM)) return null
    return decodeIds(params.get(SHARE_PARAM))
  } catch (e) {
    return null
  }
}

/**
 * Switches the map's layers to match `ids`: named layers on, every other switchable layer
 * off. Returns how many named ids were found in the map.
 */
export function applyShareIds (allLayers: any, ids: string[]): number {
  const wanted = new Set<string>(ids)
  let found = 0
  const each = (fn: (l: any) => void): void => {
    if (typeof allLayers?.forEach === 'function') allLayers.forEach(fn)
    else if (Array.isArray(allLayers)) allLayers.forEach(fn)
  }
  each((layer: any) => {
    if (!isSwitchableLayer(layer)) return
    const on = wanted.has(String(layer.id))
    if (on) found += 1
    try { if (layer.visible !== on) layer.visible = on } catch (e) { /* some layers refuse */ }
  })
  return found
}
