/*
  layer-csv.ts  -  "Export layer list (CSV)".

  Walks the LayerList's operational items (so map service sublayers and groups are included,
  which map.allLayers leaves out) and writes one row per item. Pure, no Experience Builder
  imports, so tests/layer-csv.test.cjs can run it in plain Node.
*/

export interface CsvLabels {
  layer: string
  group: string
  type: string
  on: string
  opacity: string
  minScale: string
  maxScale: string
  url: string
  yes: string
  no: string
}

/** Quotes a cell for CSV and defuses spreadsheet formulas (a leading = + - @ gets a quote). */
export function csvCell (value: any): string {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

const shortType = (layer: any): string => {
  const cls: string = String(layer?.declaredClass ?? layer?.type ?? '')
  return cls.replace(/^esri\.layers\.(support\.)?/, '')
}

const layerUrl = (layer: any): string => {
  if (!layer) return ''
  if (layer.declaredClass === 'esri.layers.support.Sublayer' && layer.layer?.url && layer.id != null) return `${layer.layer.url}/${layer.id}`
  if (layer.type === 'feature' && layer.url && layer.layerId != null) return `${layer.url}/${layer.layerId}`
  return layer.url ? String(layer.url) : ''
}

const toArray = (coll: any): any[] => (coll?.toArray ? coll.toArray() : (Array.isArray(coll) ? coll : []))

/** Rows for every item, depth first, top of the list first. Groups get a row too. */
export function collectRows (items: any, labels: CsvLabels): string[][] {
  const rows: string[][] = []
  const walk = (list: any, path: string[]): void => {
    for (const item of toArray(list)) {
      if (!item) continue
      const layer: any = item.layer
      const title: string = String(item.title ?? layer?.title ?? '')
      const on = layer ? layer.visible !== false : item.visible !== false
      rows.push([
        title,
        path.join(' / '),
        shortType(layer),
        on ? labels.yes : labels.no,
        layer && typeof layer.opacity === 'number' ? String(Math.round(layer.opacity * 100)) : '',
        layer && layer.minScale ? String(Math.round(layer.minScale)) : '',
        layer && layer.maxScale ? String(Math.round(layer.maxScale)) : '',
        layerUrl(layer)
      ])
      if (item.children && item.children.length > 0) walk(item.children, [...path, title])
    }
  }
  walk(items, [])
  return rows
}

export function buildLayerCsv (items: any, labels: CsvLabels): string {
  const header = [labels.layer, labels.group, labels.type, labels.on, labels.opacity, labels.minScale, labels.maxScale, labels.url]
  const lines = [header, ...collectRows(items, labels)].map((r: string[]) => r.map(csvCell).join(','))
  return lines.join('\r\n') + '\r\n'
}
