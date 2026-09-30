/*
  favorites.ts  -  starred layers, per browser and per widget.

  Stored under localStorage key exb-maplayers-favorites::<widgetId> as an array of layer
  ids. A tiny subscription lets the header's "Show favorites only" filter and the list
  titles react to a star toggled from the layer menu.
*/

const listeners = new Set<(widgetId: string) => void>()
const cache: Map<string, Set<string>> = new Map()

const key = (widgetId: string): string => `exb-maplayers-favorites::${widgetId}`

export function getFavorites (widgetId: string): Set<string> {
  const hit = cache.get(widgetId)
  if (hit) return hit
  let ids: string[] = []
  try {
    const raw = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(key(widgetId)) : null
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) ids = parsed.map((x: any) => String(x))
  } catch (e) { ids = [] }
  const set = new Set<string>(ids)
  cache.set(widgetId, set)
  return set
}

export function isFavorite (widgetId: string, layerId: any): boolean {
  return layerId != null && getFavorites(widgetId).has(String(layerId))
}

export function toggleFavorite (widgetId: string, layerId: any): boolean {
  if (layerId == null) return false
  const set = getFavorites(widgetId)
  const id = String(layerId)
  const now = !set.has(id)
  if (now) set.add(id); else set.delete(id)
  try {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(key(widgetId), JSON.stringify(Array.from(set)))
  } catch (e) { /* private browsing: favorites last for this page only */ }
  listeners.forEach((fn) => { try { fn(widgetId) } catch (e) { /* noop */ } })
  return now
}

export function subscribeFavorites (fn: (widgetId: string) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
