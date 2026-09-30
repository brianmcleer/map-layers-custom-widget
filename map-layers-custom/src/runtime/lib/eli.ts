/*
  eli.ts  -  reading the OSM Editor Layer Index (https://github.com/osmlab/editor-layer-index).

  The index is a GeoJSON FeatureCollection. Each feature's properties describe one imagery
  source: id, name, type (tms, wms, wmts, bing, scanex, ...), url (a template), attribution
  {text, url}, best, min_zoom, max_zoom, license_url, permission_osm, category. The geometry
  is the area the source covers, or null for worldwide sources.

  Pure functions only (no Experience Builder imports), so tests/eli.test.cjs runs them in
  plain Node. Converting an entry to a layer happens in add-layer.tsx.
*/

export interface EliEntry {
  id: string
  name: string
  type: string
  url: string
  best: boolean
  attribution: string
  attributionUrl: string
  licenseUrl: string
  category: string
  minZoom: number | null
  maxZoom: number | null
  /** [xmin, ymin, xmax, ymax] in WGS84, or null for worldwide. */
  bbox: number[] | null
}

export interface LayerSpec {
  kind: 'webtile' | 'wms'
  title: string
  copyright: string
  /** webtile */
  urlTemplate?: string
  subDomains?: string[]
  /** wms */
  url?: string
  layers?: string[]
  imageFormat?: string
  version?: string
}

/** Bounding box of a GeoJSON geometry (Polygon or MultiPolygon), or null. */
export function geometryBbox (geometry: any): number[] | null {
  if (!geometry || !geometry.coordinates) return null
  let xmin = Infinity; let ymin = Infinity; let xmax = -Infinity; let ymax = -Infinity
  const walk = (c: any): void => {
    if (typeof c[0] === 'number') {
      if (c[0] < xmin) xmin = c[0]
      if (c[0] > xmax) xmax = c[0]
      if (c[1] < ymin) ymin = c[1]
      if (c[1] > ymax) ymax = c[1]
      return
    }
    for (const child of c) walk(child)
  }
  walk(geometry.coordinates)
  if (!isFinite(xmin)) return null
  return [xmin, ymin, xmax, ymax]
}

const ADDABLE = new Set<string>(['tms', 'wms'])

/** Turns the index into entries. Types the widget cannot add (bing, wmts, scanex) are dropped. */
export function parseEli (json: any): EliEntry[] {
  const feats: any[] = Array.isArray(json?.features) ? json.features : (Array.isArray(json) ? json : [])
  const out: EliEntry[] = []
  for (const f of feats) {
    const p: any = f?.properties ?? f
    if (!p || !p.id || !p.url || !ADDABLE.has(String(p.type))) continue
    // Templates the tile layer cannot express (flipped y, quad keys) are skipped.
    if (p.type === 'tms' && (/\{-y\}/.test(p.url) || /\{u\}/.test(p.url))) continue
    out.push({
      id: String(p.id),
      name: String(p.name ?? p.id),
      type: String(p.type),
      url: String(p.url),
      best: p.best === true,
      attribution: String(p.attribution?.text ?? ''),
      attributionUrl: String(p.attribution?.url ?? ''),
      licenseUrl: String(p.license_url ?? ''),
      category: String(p.category ?? ''),
      minZoom: typeof p.min_zoom === 'number' ? p.min_zoom : null,
      maxZoom: typeof p.max_zoom === 'number' ? p.max_zoom : null,
      bbox: f?.geometry ? geometryBbox(f.geometry) : null
    })
  }
  return out
}

/** True when the source covers any part of the extent (both WGS84). Worldwide sources always do. */
export function coversExtent (entry: EliEntry, extent: number[] | null): boolean {
  if (!entry.bbox) return true
  if (!extent) return false
  const [axmin, aymin, axmax, aymax] = entry.bbox
  const [bxmin, bymin, bxmax, bymax] = extent
  return axmin <= bxmax && axmax >= bxmin && aymin <= bymax && aymax >= bymin
}

/** Sources covering the extent, regional before worldwide, best first, then by name. */
export function nearby (entries: EliEntry[], extent: number[] | null, query = ''): EliEntry[] {
  const q = query.trim().toLowerCase()
  return entries
    .filter((e: EliEntry) => coversExtent(e, extent))
    .filter((e: EliEntry) => !q || e.name.toLowerCase().includes(q) || e.attribution.toLowerCase().includes(q))
    .sort((a: EliEntry, b: EliEntry) => {
      const ra = a.bbox ? 0 : 1
      const rb = b.bbox ? 0 : 1
      if (ra !== rb) return ra - rb
      if (a.best !== b.best) return a.best ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

/** Layer construction details for an entry, or null when it cannot be expressed. */
export function toLayerSpec (entry: EliEntry): LayerSpec | null {
  const copyright = entry.attribution || entry.name
  if (entry.type === 'tms') {
    let template = entry.url
    let subDomains: string[] | undefined
    const sw = /\{switch:([^}]+)\}/.exec(template)
    if (sw) {
      subDomains = sw[1].split(',').map((s: string) => s.trim()).filter(Boolean)
      template = template.replace(sw[0], '{subDomain}')
    }
    template = template.replace(/\{zoom\}/g, '{level}').replace(/\{x\}/g, '{col}').replace(/\{y\}/g, '{row}')
    if (!/\{level\}/.test(template) || !/\{col\}/.test(template) || !/\{row\}/.test(template)) return null
    return { kind: 'webtile', title: entry.name, copyright, urlTemplate: template, subDomains }
  }
  if (entry.type === 'wms') {
    // The index stores a full GetMap template; the layer wants the base url and the layer names.
    const qIndex = entry.url.indexOf('?')
    const base = qIndex >= 0 ? entry.url.slice(0, qIndex) : entry.url
    const params: Record<string, string> = {}
    if (qIndex >= 0) {
      entry.url.slice(qIndex + 1).split('&').forEach((kv: string) => {
        const eq = kv.indexOf('=')
        const k = (eq >= 0 ? kv.slice(0, eq) : kv).toLowerCase()
        const v = eq >= 0 ? kv.slice(eq + 1) : ''
        try { params[k] = decodeURIComponent(v) } catch (e) { params[k] = v }
      })
    }
    const layers = (params.layers ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
    if (!base || layers.length === 0) return null
    return {
      kind: 'wms',
      title: entry.name,
      copyright,
      url: base,
      layers,
      imageFormat: params.format || undefined,
      version: params.version || undefined
    }
  }
  return null
}
