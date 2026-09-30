/*
  search-index.ts  -  extra text the search box can match besides the layer name.

  For each layer: the portal item's title, summary (snippet), description and tags when the
  layer came from a portal item, plus the service's own description and copyright text from
  sourceJSON when it came from a URL. HTML is stripped and everything is lower-cased once,
  so the predicate does a plain includes() per keystroke. Layers that fail to load are simply
  absent from the index and still match by name.
*/

export type SearchIndex = Map<any, string>

export function stripHtml (s: any): string {
  if (s == null) return ''
  return String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

/** Builds the searchable text for one layer from whatever metadata is present. */
export function layerSearchText (layer: any): string {
  if (!layer) return ''
  const parts: string[] = []
  const item: any = layer.portalItem
  if (item) {
    parts.push(item.title, item.snippet, item.description)
    const tags: any = item.tags
    if (tags && tags.length) parts.push((tags.toArray ? tags.toArray() : tags).join(' '))
  }
  const src: any = layer.sourceJSON
  if (src) parts.push(src.description, src.copyrightText, src.serviceDescription)
  if (layer.copyright) parts.push(layer.copyright)
  return stripHtml(parts.filter(Boolean).join(' ')).toLowerCase()
}

const toArray = (coll: any): any[] => (coll?.toArray ? coll.toArray() : (Array.isArray(coll) ? coll : []))

/** Loads each layer (and its portal item) far enough to read metadata, then indexes it. */
export async function buildSearchIndex (allLayers: any): Promise<SearchIndex> {
  const index: SearchIndex = new Map()
  const layers = toArray(allLayers)
  // A few at a time so a big map does not open dozens of item requests at once.
  const batch = 6
  for (let i = 0; i < layers.length; i += batch) {
    await Promise.all(layers.slice(i, i + batch).map(async (layer: any) => {
      try {
        if (layer?.load && layer.loadStatus !== 'loaded') await layer.load()
        const item: any = layer?.portalItem
        if (item && typeof item.load === 'function' && !item.loaded) await item.load()
      } catch (e) { /* metadata stays whatever is already there */ }
      try {
        const text = layerSearchText(layer)
        if (text) index.set(layer, text)
        // Sublayers of a map service share their parent's service text.
        const subs = toArray(layer?.allSublayers ?? layer?.sublayers)
        for (const sub of subs) {
          const own = stripHtml(sub?.sourceJSON?.description ?? '').toLowerCase()
          const combined = [text, own].filter(Boolean).join(' ')
          if (combined) index.set(sub, combined)
        }
      } catch (e) { /* skip */ }
    }))
  }
  return index
}
