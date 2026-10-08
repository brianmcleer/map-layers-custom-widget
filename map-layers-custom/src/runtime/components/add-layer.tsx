/** @jsx jsx */
import { css, hooks, type IMThemeVariables, jsx, React } from 'jimu-core'
import { MapViewManager, loadArcGISJSAPIModules } from 'jimu-arcgis'
import {
  Button, TextInput, Tooltip, FloatingPanel, Label, Alert,
  Tabs, Tab, Dropdown, DropdownButton, DropdownMenu, DropdownItem
} from 'jimu-ui'
import message from '../translations/default'
import { parseEli, nearby, toLayerSpec, type EliEntry } from '../lib/eli'

interface AddLayerProps {
  theme: IMThemeVariables
  jimuMapViewId: string
  viewFromMapWidget?: any
  // "Imagery nearby" tab fed by the OSM Editor Layer Index.
  enableImagery?: boolean
  imageryIndexUrl?: string
  onImageryAdded?: (name: string) => void
}

const { useState, useCallback, useRef, useEffect } = React

export const ELI_DEFAULT_URL = 'https://osmlab.github.io/editor-layer-index/imagery.geojson'

// The index is a few megabytes; read it once per page and share it between widgets.
const eliCache: { [url: string]: Promise<EliEntry[]> } = {}
const loadEli = (url: string): Promise<EliEntry[]> => {
  if (!eliCache[url]) {
    // esri/request, not window.fetch: some City deployments wrap fetch with a CDN shim that
    // rewrites absolute URLs (see the Mailing Labels geocode fix).
    eliCache[url] = loadArcGISJSAPIModules(['esri/request']).then(([esriRequest]: any[]) =>
      esriRequest(url, { responseType: 'json', timeout: 60000 })
    ).then((res: any) => parseEli(res?.data)).catch((e: any) => { delete eliCache[url]; throw e })
  }
  return eliCache[url]
}

// The view's extent as [xmin, ymin, xmax, ymax] in WGS84, or null when it cannot be projected.
const extentToWgs84 = async (view: any): Promise<number[] | null> => {
  try {
    const ext = view?.extent
    if (!ext) return null
    const wkid = ext.spatialReference?.wkid
    if (wkid === 4326) return [ext.xmin, ext.ymin, ext.xmax, ext.ymax]
    const [projectOperator, SpatialReference] = await loadArcGISJSAPIModules(['esri/geometry/operators/projectOperator', 'esri/geometry/SpatialReference'])
    if (typeof projectOperator.isLoaded === 'function' && !projectOperator.isLoaded()) await projectOperator.load()
    const out: any = projectOperator.execute(ext, new SpatialReference({ wkid: 4326 }))
    if (!out) return null
    return [out.xmin, out.ymin, out.xmax, out.ymax]
  } catch (e) {
    return null
  }
}

type Phase = 'idle' | 'working' | 'error' | 'success'

// URL data types, each mapped to the JS API layer module that handles it and a
// realistic sample URL — mirrors Esri's Add Data "URL" tab.
const URL_TYPES: Array<{ id: string, label: string, module?: string, sample: string }> = [
  { id: 'auto', label: 'Auto-detect (service URL or item ID)', sample: 'https://services.arcgis.com/…/FeatureServer  ·  or a 32-char item ID' },
  { id: 'arcgis', label: 'ArcGIS web service', module: 'esri/layers/Layer', sample: 'https://services.arcgis.com/<org>/arcgis/rest/services/<name>/FeatureServer' },
  { id: 'vectortile', label: 'Vector tile service', module: 'esri/layers/VectorTileLayer', sample: 'https://<host>/arcgis/rest/services/<name>/VectorTileServer' },
  { id: 'wms', label: 'WMS', module: 'esri/layers/WMSLayer', sample: 'https://<host>/geoserver/wms?service=WMS&request=GetCapabilities' },
  { id: 'wmts', label: 'WMTS', module: 'esri/layers/WMTSLayer', sample: 'https://<host>/service/wmts/1.0.0/WMTSCapabilities.xml' },
  { id: 'geojson', label: 'GeoJSON (web link)', module: 'esri/layers/GeoJSONLayer', sample: 'https://<host>/data.geojson' },
  { id: 'csv', label: 'CSV (web link)', module: 'esri/layers/CSVLayer', sample: 'https://<host>/data.csv' },
  { id: 'kml', label: 'KML (web link)', module: 'esri/layers/KMLLayer', sample: 'https://<host>/data.kml' }
]

// Minimal, dependency-free KML -> GeoJSON. KMLLayer relies on a hosted Esri
// utility service that fetches the URL server-side, so it cannot read a local
// blob: URL. Local KML is therefore parsed here into GeoJSON. Features are
// grouped by geometry type because a GeoJSONLayer holds a single type.
const GEOM_LABEL: Record<string, string> = { point: 'points', polyline: 'lines', polygon: 'polygons' }

const kmlToGeoJSONGroups = (text: string): Record<string, any> => {
  const groups: Record<string, any> = {}
  const add = (key: string, feature: any) => {
    if (!groups[key]) groups[key] = { type: 'FeatureCollection', features: [] }
    groups[key].features.push(feature)
  }
  const dom = new DOMParser().parseFromString(text, 'text/xml')
  const firstText = (el: Element, tag: string): string => {
    const n = el.getElementsByTagName(tag)[0]
    return n && n.textContent ? n.textContent.trim() : ''
  }
  const parseCoords = (str: string): number[][] => {
    return (str || '').trim().split(/\s+/).map((tok) => {
      const p = tok.split(',')
      return [parseFloat(p[0]), parseFloat(p[1])]
    }).filter((c) => isFinite(c[0]) && isFinite(c[1]))
  }
  const placemarks = dom.getElementsByTagName('Placemark')
  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i]
    const props = { name: firstText(pm, 'name'), description: firstText(pm, 'description') }
    const pts = pm.getElementsByTagName('Point')
    for (let j = 0; j < pts.length; j++) {
      const c = parseCoords(firstText(pts[j], 'coordinates'))
      if (c[0]) add('point', { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c[0] } })
    }
    const lines = pm.getElementsByTagName('LineString')
    for (let j = 0; j < lines.length; j++) {
      const c = parseCoords(firstText(lines[j], 'coordinates'))
      if (c.length > 1) add('polyline', { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: c } })
    }
    const polys = pm.getElementsByTagName('Polygon')
    for (let j = 0; j < polys.length; j++) {
      const poly = polys[j]
      const rings: number[][][] = []
      const outer = poly.getElementsByTagName('outerBoundaryIs')[0]
      if (outer) { const co = outer.getElementsByTagName('coordinates')[0]; if (co) { const r = parseCoords(co.textContent); if (r.length) rings.push(r) } }
      const inners = poly.getElementsByTagName('innerBoundaryIs')
      for (let k = 0; k < inners.length; k++) { const co = inners[k].getElementsByTagName('coordinates')[0]; if (co) { const r = parseCoords(co.textContent); if (r.length) rings.push(r) } }
      if (rings.length && rings[0].length > 2) add('polygon', { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: rings } })
    }
  }
  return groups
}

// Build an Esri geometry from a GeoJSON geometry (assumed WGS84).
const geojsonToEsriGeometry = (g: any, M: any): any => {
  if (!g) return null
  const spatialReference = { wkid: 4326 }
  if (g.type === 'Point') return new M.Point({ x: g.coordinates[0], y: g.coordinates[1], spatialReference })
  if (g.type === 'MultiPoint') return g.coordinates[0] ? new M.Point({ x: g.coordinates[0][0], y: g.coordinates[0][1], spatialReference }) : null
  if (g.type === 'LineString') return new M.Polyline({ paths: [g.coordinates], spatialReference })
  if (g.type === 'MultiLineString') return new M.Polyline({ paths: g.coordinates, spatialReference })
  if (g.type === 'Polygon') return new M.Polygon({ rings: g.coordinates, spatialReference })
  if (g.type === 'MultiPolygon') { const rings: any[] = []; g.coordinates.forEach((poly: any) => poly.forEach((r: any) => rings.push(r))); return new M.Polygon({ rings, spatialReference }) }
  return null
}

// Rebuild the per-feature symbol exported by the draw tool. Points with an
// embedded picture-marker keep their icon, size and rotation; lines and
// polygons keep their colors. Falls back to sensible defaults.
const drawSymbolFor = (geomType: string, p: any, S: any): any => {
  const st = (p.symbolType || '').toLowerCase()
  if (geomType === 'Point' || geomType === 'MultiPoint') {
    if (st.indexOf('picture') >= 0 && p.imageUrl) {
      return new S.Pic({ url: p.imageUrl, width: p.imageWidth || 24, height: p.imageHeight || 24, angle: p.imageRotation || 0 })
    }
    return new S.Marker({ style: 'circle', color: p.color || p.markerColor || '#2e8540', size: p.size || 9, outline: { color: p.outlineColor || '#ffffff', width: p.outlineWidth || 1 } })
  }
  if (geomType === 'LineString' || geomType === 'MultiLineString') {
    return new S.Line({ color: p.color || p.strokeColor || p.lineColor || '#2e8540', width: p.width || p.strokeWidth || p.lineWidth || 2 })
  }
  return new S.Fill({ color: p.fillColor || p.color || [46, 133, 64, 0.25], outline: { color: p.outlineColor || p.strokeColor || '#2e8540', width: p.outlineWidth || p.strokeWidth || 1.5 } })
}

const panelStyle = css`
  width: 360px;
  height: 440px;
`

// Only layout/spacing lives here; every control is a jimu-ui component carrying
// its own Calcite-based theming. Tab styling mirrors the OOTB Add Data widget.
const getBodyStyle = (theme: IMThemeVariables) => css`
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 10px 14px 14px;
  overflow: hidden;
  .jimu-nav { border-bottom: 1px solid ${theme.sys.color.divider.secondary}; }
  .jimu-nav .jimu-nav-link.active, .jimu-nav .jimu-nav-link:hover:not(.active) { color: ${theme.sys.color.primary.main}; }
  .jimu-nav .jimu-nav-link.active { border-color: ${theme.sys.color.primary.main}; }
  .al-tabpanel { padding-top: 12px; }
  .al-intro { font-size: 0.8125rem; opacity: .8; margin-bottom: 14px; line-height: 1.45; }
  .al-field { margin-bottom: 12px; }
  .al-type-dd, .al-type-dd > div, .al-type-dd button { width: 100%; }
  .al-type-dd button { justify-content: space-between; }
  .al-sample { font-size: 0.75rem; opacity: .65; margin-top: 6px; line-height: 1.4; word-break: break-all; }
  .al-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  .al-alert { width: 100%; margin-top: 12px; }
  .al-drop { border: 1.5px dashed ${theme.sys.color.divider.primary}; border-radius: 4px; padding: 24px 14px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
  .al-drop.drag { border-color: ${theme.sys.color.primary.main}; background: ${theme.ref.palette.neutral[300]}; }
  .al-drop-main { font-weight: 500; margin-bottom: 4px; }
  .al-drop-sub { font-size: 0.8125rem; opacity: .75; }
  .al-formats { font-size: 0.75rem; opacity: .6; margin-top: 8px; }
  .al-eli-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; border: 1px solid ${theme.sys.color.divider.secondary}; border-radius: 4px; }
  .al-eli-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-bottom: 1px solid ${theme.sys.color.divider.secondary}; font-size: 0.8125rem; }
  .al-eli-row:last-child { border-bottom: none; }
  .al-eli-text { flex: 1 1 auto; min-width: 0; }
  .al-eli-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .al-eli-meta { font-size: 0.75rem; opacity: .7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .al-eli-best { font-size: 0.6875rem; padding: 0 5px; border-radius: 8px; background: ${theme.sys.color.primary.main}; color: ${theme.sys.color.primary.text}; margin-left: 4px; }
  .al-eli-note { font-size: 0.75rem; opacity: .7; margin-top: 8px; line-height: 1.4; }
  .al-tabpanel.al-eli { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .al-file { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding: 6px 8px 6px 12px; background: ${theme.ref.palette.neutral[300]}; border-radius: 4px; font-size: 0.8125rem; }
`

const PlusGlyph = () => (
  <svg width='16' height='16' viewBox='0 0 16 16' aria-hidden='true'><path d='M8 3v10M3 8h10' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' /></svg>
)
const CloseGlyph = () => (
  <svg width='14' height='14' viewBox='0 0 16 16' aria-hidden='true'><path d='M4 4l8 8M12 4l-8 8' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' /></svg>
)

export default function AddLayer (props: AddLayerProps) {
  const { theme, jimuMapViewId, viewFromMapWidget, enableImagery = false, imageryIndexUrl, onImageryAdded } = props
  const translate = hooks.useTranslation(message)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('url')
  const [typeId, setTypeId] = useState('auto')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File>(null)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [statusText, setStatusText] = useState('')
  const inFlight = useRef(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const busy = phase === 'working'
  const selectedType = URL_TYPES.find(t => t.id === typeId) || URL_TYPES[0]

  // Imagery nearby (Editor Layer Index)
  const [eliEntries, setEliEntries] = useState<EliEntry[] | null>(null)
  const [eliExtent, setEliExtent] = useState<number[] | null>(null)
  const [eliQuery, setEliQuery] = useState('')
  const [eliState, setEliState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const resolveView = useCallback((): any => {
    if (viewFromMapWidget) return viewFromMapWidget
    const jmv = MapViewManager.getInstance().getJimuMapViewById(jimuMapViewId)
    return (jmv?.view as any) || null
  }, [viewFromMapWidget, jimuMapViewId])

  const close = useCallback(() => {
    if (inFlight.current) return
    setOpen(false); setUrl(''); setFile(null); setDragging(false); setPhase('idle'); setStatusText('')
  }, [])

  // Load the index and the current extent when the Imagery tab opens.
  useEffect(() => {
    if (!open || !enableImagery || tab !== 'imagery') return
    let cancelled = false
    setEliState('loading')
    const view = resolveView()
    Promise.all([loadEli(imageryIndexUrl || ELI_DEFAULT_URL), extentToWgs84(view)]).then(([entries, extent]) => {
      if (cancelled) return
      setEliEntries(entries); setEliExtent(extent); setEliState('ready')
    }).catch((e: any) => {
      console.error('Imagery index failed', e)
      if (!cancelled) setEliState('error')
    })
    return () => { cancelled = true }
  }, [open, tab, enableImagery, imageryIndexUrl, resolveView])

  const addImagery = useCallback((entry: EliEntry) => {
    if (inFlight.current) return
    const view = resolveView()
    if (!view || !view.map) { setError(translate('addLayerNoView')); return }
    const spec = toLayerSpec(entry)
    if (!spec) { setError(translate('imageryNotAddable')); return }
    inFlight.current = true; setPhase('working'); setStatusText(translate('addLayerWorking'))
    const modulePath = spec.kind === 'webtile' ? 'esri/layers/WebTileLayer' : 'esri/layers/WMSLayer'
    loadArcGISJSAPIModules([modulePath]).then(([Ctor]: any[]) => {
      const layer = spec.kind === 'webtile'
        ? new Ctor({ urlTemplate: spec.urlTemplate, subDomains: spec.subDomains, title: spec.title, copyright: spec.copyright, opacity: 1 })
        : new Ctor({ url: spec.url, title: spec.title, copyright: spec.copyright, sublayers: spec.layers.map((name: string) => ({ name })), imageFormat: spec.imageFormat, version: spec.version })
      // Imagery goes under every operational layer, like a second basemap.
      view.map.add(layer, 0)
      inFlight.current = false
      setPhase('success'); setStatusText(translate('imageryAdded').replace('{name}', entry.name))
      onImageryAdded && onImageryAdded(entry.name)
      window.setTimeout(() => { close() }, 900)
    }).catch((e: any) => { console.error('Add imagery failed', e); setError(translate('addLayerError')) })
  }, [resolveView, close, translate, onImageryAdded])

  const eliVisible = eliEntries ? nearby(eliEntries, eliExtent, eliQuery).slice(0, 80) : []

  const clearErr = () => { if (phase === 'error') { setPhase('idle'); setStatusText('') } }
  const setError = (text: string) => { inFlight.current = false; setPhase('error'); setStatusText(text) }

  // Add a finished layer to the map, zoom to it, confirm, and close.
  const finish = useCallback((layer: any) => {
    const view = resolveView()
    if (!layer || !view?.map) { setError('That layer couldn’t be added. Check the source and try again.'); return }
    view.map.add(layer)
    if (layer.when) {
      layer.when(() => {
        try { if (view.goTo && layer.fullExtent) view.goTo(layer.fullExtent).catch(() => {}) } catch (e) { /* noop */ }
      }, () => { /* failed to load */ })
    }
    inFlight.current = false
    setPhase('success'); setStatusText('Layer added.'); setUrl(''); setFile(null)
    window.setTimeout(() => { close() }, 800)
  }, [resolveView, close])

  const addFromUrl = useCallback(() => {
    const raw = (url || '').trim()
    if (!raw || inFlight.current) return
    const view = resolveView()
    if (!view || !view.map) { setError('No map is connected yet, so the layer can’t be added.'); return }
    inFlight.current = true; setPhase('working'); setStatusText('Adding layer…')

    const t = URL_TYPES.find(x => x.id === typeId) || URL_TYPES[0]
    if (t.id === 'auto' || t.id === 'arcgis') {
      loadArcGISJSAPIModules(['esri/layers/Layer']).then(([Layer]: any[]) => {
        const isItem = /\/home\/item\.html|\/items\//i.test(raw) || /[?&]id=/i.test(raw) || /^[0-9a-f]{32}$/i.test(raw)
        return (t.id === 'auto' && isItem)
          ? Layer.fromPortalItem({ portalItem: { id: (raw.match(/[?&]id=([0-9a-f]{32})/i) || [])[1] || raw } })
          : Layer.fromArcGISServerUrl({ url: raw })
      }).then(finish).catch((e: any) => { console.error('Add layer (url) failed', e); setError('That layer couldn’t be added. Check the URL or item ID.') })
    } else {
      loadArcGISJSAPIModules([t.module]).then(([Ctor]: any[]) => { finish(new Ctor({ url: raw })) })
        .catch((e: any) => { console.error('Add layer (typed url) failed', e); setError('That ' + t.label + ' layer couldn’t be added. Check the URL.') })
    }
  }, [url, typeId, resolveView, finish])

  const addFromFile = useCallback(() => {
    if (!file || inFlight.current) return
    const view = resolveView()
    if (!view || !view.map) { setError('No map is connected yet, so the layer can’t be added.'); return }
    inFlight.current = true; setPhase('working'); setStatusText('Reading file…')

    const lower = file.name.toLowerCase()
    const title = file.name.replace(/\.[^.]+$/, '')
    const fromObjectUrl = (modulePath: string) => {
      loadArcGISJSAPIModules([modulePath]).then(([Ctor]: any[]) => {
        finish(new Ctor({ url: URL.createObjectURL(file), title }))
      }).catch((e: any) => { console.error('Add layer (file) failed', e); setError('That file couldn’t be added.') })
    }

    if (/\.(geojson|json)$/.test(lower)) {
      file.text().then((text) => {
        let gj: any = null
        try { gj = JSON.parse(text) } catch (e) { /* not json */ }
        const feats = gj && gj.features
        const hasDrawStyle = Array.isArray(feats) && feats.some((f: any) => f && f.properties && f.properties.symbolType)
        if (!hasDrawStyle) {
          // Ordinary GeoJSON data — let the layer render it with its default symbol.
          return loadArcGISJSAPIModules(['esri/layers/GeoJSONLayer']).then(([GeoJSONLayer]: any[]) => {
            finish(new GeoJSONLayer({ url: URL.createObjectURL(file), title }))
          })
        }
        // Drawings export: rebuild each feature's own symbol on a GraphicsLayer.
        setStatusText('Rebuilding drawing styles…')
        return loadArcGISJSAPIModules([
          'esri/Graphic', 'esri/layers/GraphicsLayer',
          'esri/geometry/Point', 'esri/geometry/Polyline', 'esri/geometry/Polygon',
          'esri/symbols/PictureMarkerSymbol', 'esri/symbols/SimpleMarkerSymbol',
          'esri/symbols/SimpleLineSymbol', 'esri/symbols/SimpleFillSymbol'
        ]).then(([Graphic, GraphicsLayer, Point, Polyline, Polygon, PictureMarkerSymbol, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol]: any[]) => {
          const M = { Point, Polyline, Polygon }
          const S = { Pic: PictureMarkerSymbol, Marker: SimpleMarkerSymbol, Line: SimpleLineSymbol, Fill: SimpleFillSymbol }
          const graphics: any[] = []
          feats.forEach((f: any) => {
            try {
              const geom = geojsonToEsriGeometry(f.geometry, M)
              if (!geom) return
              const p = f.properties || {}
              const sym = drawSymbolFor(f.geometry.type, p, S)
              graphics.push(new Graphic({
                geometry: geom,
                symbol: sym,
                attributes: { name: p.name, description: p.description, notes: p.notes, type: p.type, created: p.created },
                popupTemplate: { title: '{name}', content: '{description}' }
              }))
            } catch (e) { /* skip bad feature */ }
          })
          if (!graphics.length) { setError('No drawings were found in that file.'); return }
          const layer = new GraphicsLayer({ title, graphics, listMode: 'show' })
          const v = resolveView()
          v.map.add(layer)
          inFlight.current = false
          setPhase('success'); setStatusText(`Added ${graphics.length} drawing${graphics.length > 1 ? 's' : ''} with their original styles.`); setUrl(''); setFile(null)
          try { if (v.goTo) v.goTo(graphics).catch(() => {}) } catch (e) { /* noop */ }
          window.setTimeout(() => { close() }, 900)
        })
      }).catch((e: any) => { console.error('Add geojson failed', e); setError('That file couldn’t be added.') })
    } else if (/\.csv$/.test(lower)) {
      fromObjectUrl('esri/layers/CSVLayer')
    } else if (/\.kml$/.test(lower)) {
      // Parse locally (KMLLayer needs a service-reachable URL, not a blob).
      setStatusText('Reading KML…')
      file.text().then((text) => {
        const groups = kmlToGeoJSONGroups(text)
        const keys = Object.keys(groups)
        if (keys.length === 0) { setError('No map features were found in that KML.'); return null }
        return loadArcGISJSAPIModules(['esri/layers/GeoJSONLayer', 'esri/layers/GroupLayer']).then(([GeoJSONLayer, GroupLayer]: any[]) => {
          const layers = keys.map((k) => new GeoJSONLayer({
            url: URL.createObjectURL(new Blob([JSON.stringify(groups[k])], { type: 'application/json' })),
            title: keys.length > 1 ? `${title} (${GEOM_LABEL[k] || k})` : title
          }))
          if (layers.length === 1) { finish(layers[0]) } else { finish(new GroupLayer({ title, layers })) }
        })
      }).catch((e: any) => { console.error('Add KML failed', e); setError('That KML couldn’t be read.') })
    } else if (/\.zip$/.test(lower)) {
      setStatusText('Converting shapefile…')
      file.arrayBuffer().then((buf) => import('shpjs').then((m: any) => (m.default || m)(buf)))
        .then((gj: any) => {
          const blob = new Blob([JSON.stringify(gj)], { type: 'application/json' })
          return loadArcGISJSAPIModules(['esri/layers/GeoJSONLayer']).then(([GeoJSONLayer]: any[]) => {
            finish(new GeoJSONLayer({ url: URL.createObjectURL(blob), title }))
          })
        }).catch((e: any) => { console.error('Add shapefile failed', e); setError('That shapefile couldn’t be read. Use a .zip containing .shp, .dbf, and .prj.') })
    } else {
      setError('Unsupported file. Use GeoJSON, CSV, KML, or a zipped shapefile.')
    }
  }, [file, resolveView, finish])

  const onPickFile = (f: File) => { if (f) { setFile(f); clearErr() } }

  const statusAlert = statusText
    ? <Alert className='al-alert' open tabIndex={0} type={phase === 'error' ? 'error' : phase === 'success' ? 'success' : 'info'} text={statusText} />
    : null

  return (
    <div className='map-layers-add-layer' css={css`display:inline-flex;align-items:center;`} ref={triggerRef}>
      <Tooltip role='tooltip' title={translate('addLayer')} placement='top'>
        <Button color='inherit' variant='text' icon aria-label={translate('addLayer')} aria-expanded={open} onClick={() => { open ? close() : setOpen(true) }}>
          <PlusGlyph />
        </Button>
      </Tooltip>

      <FloatingPanel
        open={open}
        reference={triggerRef.current}
        placement='bottom-start'
        headerTitle='Add data'
        onHeaderClose={close}
        dragBounds='body'
        css={panelStyle}
        defaultSize={{ width: 360, height: 440 }}
        minSize={{ width: 300, height: 320 }}
      >
        <div css={getBodyStyle(theme)}>
          <Tabs type='underline' fill value={tab} onChange={(v: any) => setTab(v)}>
            <Tab id='url' title='URL'>
              <div className='al-tabpanel'>
                <div className='al-intro'>{translate('addALayerThatAlreadyLives')}</div>
                <div className='al-field'>
                  <Label>{translate('detailType')}</Label>
                  <Dropdown className='al-type-dd' size='sm'>
                    <DropdownButton size='sm' disabled={busy}>{selectedType.label}</DropdownButton>
                    <DropdownMenu>
                      {URL_TYPES.map(t => (
                        <DropdownItem key={t.id} active={t.id === typeId} onClick={() => { setTypeId(t.id); clearErr() }}>{t.label}</DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                  <div className='al-sample'>{translate('exampleSample', { sample: selectedType.sample })}</div>
                </div>

                <div className='al-field'>
                  <Label>{typeId === 'auto' ? translate('urlOrItemId') : 'URL'}</Label>
                  <TextInput
                    size='sm' style={{ width: '100%' }} autoFocus value={url} disabled={busy}
                    placeholder={selectedType.sample}
                    onChange={(e) => { setUrl(e.target.value); clearErr() }}
                    onKeyDown={(e) => { if (e.key === 'Enter') addFromUrl(); if (e.key === 'Escape') close() }}
                  />
                </div>

                <div className='al-actions'>
                  <Button size='sm' type='tertiary' disabled={busy} onClick={close}>{translate('cancel')}</Button>
                  <Button size='sm' type='primary' disabled={busy || !url.trim()} onClick={addFromUrl}>{translate('addLayerSubmit')}</Button>
                </div>
                {statusAlert}
              </div>
            </Tab>

            {enableImagery &&
              <Tab id='imagery' title={translate('imageryTab')}>
                <div className='al-tabpanel al-eli'>
                  <div className='al-intro'>{translate('imageryIntro')}</div>
                  <div className='al-field'>
                    <TextInput
                      size='sm' style={{ width: '100%' }} allowClear value={eliQuery} disabled={eliState !== 'ready'}
                      placeholder={translate('imagerySearch')}
                      onChange={(e) => { setEliQuery(e.target.value) }}
                    />
                  </div>
                  {eliState === 'loading' && <div className='al-eli-note'>{translate('imageryLoading')}</div>}
                  {eliState === 'error' && <Alert className='al-alert' open type='error' text={translate('imageryError')} />}
                  {eliState === 'ready' &&
                    <div className='al-eli-list' role='list'>
                      {eliVisible.length === 0 && <div className='al-eli-note' style={{ padding: 8 }}>{translate('imageryNone')}</div>}
                      {eliVisible.map((entry: EliEntry) => (
                        <div className='al-eli-row' key={entry.id} role='listitem'>
                          <div className='al-eli-text'>
                            <div className='al-eli-name' title={entry.name}>
                              {entry.name}
                              {entry.best && <span className='al-eli-best'>{translate('imageryBest')}</span>}
                            </div>
                            <div className='al-eli-meta' title={entry.attribution}>{entry.type.toUpperCase()}{entry.attribution ? ` · ${entry.attribution}` : ''}</div>
                          </div>
                          <Button size='sm' type='tertiary' disabled={busy} onClick={() => { addImagery(entry) }} aria-label={`${translate('add')}: ${entry.name}`}>{translate('add')}</Button>
                        </div>
                      ))}
                    </div>
                  }
                  {eliState === 'ready' && <div className='al-eli-note'>{translate('imageryLicense')}</div>}
                  {statusAlert}
                </div>
              </Tab>
            }

            <Tab id='file' title={translate('file')}>
              <div className='al-tabpanel'>
                <div className='al-intro'>{translate('addAFileSavedOnYour')}</div>
                <div
                  className={`al-drop ${dragging ? 'drag' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer?.files?.[0]; if (f) onPickFile(f) }}
                  onClick={() => fileInputRef.current?.click()}
                  role='button' tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
                >
                  <div className='al-drop-main'>{translate('dragAFileFromYourComputer')}</div>
                  <div className='al-drop-sub'>{translate('symbologyAndStructureAreKeptWhere')}</div>
                  <div className='al-formats'>{translate('geoJSONCsvKmlOrAZipped')}</div>
                </div>
                <input
                  ref={fileInputRef} type='file' hidden accept='.geojson,.json,.csv,.kml,.zip'
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = '' }}
                />
                {file &&
                  <div className='al-file'>
                    <span>{file.name}</span>
                    <Button type='tertiary' icon size='sm' aria-label={translate('removeFile')} disabled={busy} onClick={() => setFile(null)}><CloseGlyph /></Button>
                  </div>
                }

                <div className='al-actions'>
                  <Button size='sm' type='tertiary' disabled={busy} onClick={close}>{translate('cancel')}</Button>
                  <Button size='sm' type='primary' disabled={busy || !file} onClick={addFromFile}>{translate('addLayerSubmit')}</Button>
                </div>
                {statusAlert}
              </div>
            </Tab>
          </Tabs>
        </div>
      </FloatingPanel>
    </div>
  )
}
