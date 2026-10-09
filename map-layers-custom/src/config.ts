import type { ImmutableObject } from 'jimu-core'

export interface Config {
  /** Show the question-mark button that opens the help guide. Undefined means on,
   *  so apps configured before this setting existed keep their help button. */
  showHelp?: boolean
  goto?: boolean
  label?: boolean
  opacity?: boolean
  information?: boolean
  setVisibility?: boolean
  useMapWidget?: boolean
  enableLegend?: boolean
  useTickBoxes?: boolean
  showAllLegend?: boolean
  reorderLayers?: boolean
  searchLayers?: boolean
  expandAllLayers?: boolean
  showTables?: boolean
  popup?: boolean
  visibilityRange?: boolean
  layerBatchOptions?: boolean
  changeSymbolForRuntimeLayers?: boolean
  // ---- Enhanced "power" options (added by the custom fork) ----
  // Adds a per-layer "Show only this layer" (solo / isolate) action that
  // turns every other operational layer off in one click.
  soloLayer?: boolean
  // Shows a live "N / M visible" badge in the header so users can see at a
  // glance how many layers are switched on (Leaflet layers-control style).
  showLayerCount?: boolean
  // Lets users collapse the whole layer list down to just the header bar,
  // mirroring the collapsible Leaflet layers control.
  collapsibleList?: boolean
  // Whether the collapsible list should start collapsed when the app loads.
  startCollapsed?: boolean
  // Custom placeholder text for the filter/search box. Falls back to the
  // localized default when empty.
  filterPlaceholder?: string
  // Enables the "Saved views" control — lets end users capture and re-apply
  // named layer-visibility combinations (persisted in the browser per widget).
  enableLayerViews?: boolean
  // When a layer is switched on, also switch on its ancestor group layers so
  // it actually renders. Without this, checking a sub-layer whose parent group
  // is off has no visible effect (the group gates child rendering). Defaults to
  // on; set false to restore the stock behavior.
  autoShowParentLayers?: boolean
  // Adds a bundle of extra per-layer tools to the layer's "..." menu:
  // Flash/locate, Copy service URL, Refresh, and a rich Layer details panel.
  extraLayerTools?: boolean
  // Adds a header "+" control that lets users add a layer to the live map by
  // pasting a Feature/Map service or portal-item URL.
  enableAddLayer?: boolean
  // Header control: a master opacity slider that fades all operational layers.
  enableMasterOpacity?: boolean
  // Header control: a basemap switcher dropdown.
  enableBasemapSwitcher?: boolean
  // Header control: a toggle that shows a combined legend panel.
  enableLegendPanel?: boolean
  // Per-tool visibility for the extra 3-dot tools (only apply when
  // extraLayerTools is on). Undefined === enabled, so existing apps that turned
  // on extraLayerTools keep showing every tool until one is explicitly hidden.
  toolFlash?: boolean
  toolCopyUrl?: boolean
  toolRefresh?: boolean
  toolDetails?: boolean
  toolSpotlight?: boolean
  toolMove?: boolean
  symbolOption?: 'predefined' | 'custom'
  // Pick one layer per group ("radio buttons"). When on, every group layer
  // listed in pickOneGroupIds for the active map view lets only one of its
  // layers be on at a time (the group runs in the SDK's exclusive visibility
  // mode). With "Use tick boxes" on, the list draws those layers with round
  // buttons instead of boxes; with eye icons it still allows only one.
  enablePickOneGroups?: boolean
  // Batch options gains "Copy link to these layers": a page address with ?mlc=<layer ids>
  // that opens the app with the same layers on. Needs layerBatchOptions.
  enableShareLink?: boolean
  // Record layer on/off clicks (title only) in the usage telemetry. Undefined means on;
  // only matters when the beacon itself is on.
  telemetryLayers?: boolean
  // Report layers that fail to load, fail to draw, or name a sublayer the service no longer
  // has, once per page load, as layer-broken rows (path and reason only). Default on.
  reportBrokenLayers?: boolean
  // The search box also matches each layer's description, summary and tags (portal item
  // or service metadata), not only its name. Needs searchLayers.
  searchLayerDescriptions?: boolean
  // Batch options gains "Export layer list (CSV)". Needs layerBatchOptions.
  enableLayerCsv?: boolean
  // Checks every service behind the list on a timer and marks a layer whose service does
  // not answer with "(service not answering)". Reports each outage to the telemetry once.
  enableLayerHealth?: boolean
  // Minutes between health checks (default 5, minimum 1).
  layerHealthMinutes?: number
  // Show the list names cleaned up: underscores to spaces, an optional prefix pattern
  // removed (regular expression, case-insensitive), optional title case. Display only.
  cleanLayerNames?: boolean
  cleanNamePrefix?: string
  cleanNameTitleCase?: boolean
  // Show layer names in the app language (display only; the web map titles never change).
  // Updates when the locale changes (?locale=, browser, ArcGIS profile, Language Switcher).
  translateLayerNames?: boolean
  // Use the shared translation memory (exb-i18n-kit on GitHub). Undefined means on.
  layerNamesFromMemory?: boolean
  // Folder URL with <locale>.json memory files; empty = the exb-i18n-kit memory.
  layerNameMemoryUrl?: string
  // Optional LibreTranslate server for names nobody translated yet (results cached per page).
  layerNameMtUrl?: string
  layerNameMtKey?: string
  // Names always shown as in the web map (proper nouns, acronyms).
  layerNameKeep?: string[]
  // The builder's own translations: web map name -> { locale -> name }. Win over the memory.
  layerNameOverrides?: { [english: string]: { [locale: string]: string } }
  // Star layers from the layer menu (per browser) and filter the list to them.
  enableFavorites?: boolean
  // Add layer panel gains an "Imagery nearby" tab fed by the OSM Editor Layer Index.
  enableImageryIndex?: boolean
  // Where the index is read from; defaults to the osmlab GitHub Pages copy.
  imageryIndexUrl?: string
  // Extra tool: "Zoom until visible" for layers outside their visible range.
  toolZoomToScale?: boolean
  // Preset views: sets of layers the builder captured, shown read-only at the top of the
  // Saved views menu in the published app. Keyed by jimuMapViewId. layerIds lists the
  // switchable layers that are on; every other switchable layer goes off when applied.
  presetViews?: {
    [jimuMapViewId: string]: PresetView[]
  }
  // Group layers (by jimuLayerViewId, keyed by jimuMapViewId) that run in
  // pick-one mode. Only applied while enablePickOneGroups is on.
  pickOneGroupIds?: {
    [jimuMapViewId: string]: string[]
  }
  customizeLayerOptions?: {
    [jimuMapViewId: string]: CustomizeLayerOption
  }
}

export interface PresetView {
  id: string
  name: string
  layerIds: string[]
}

export interface CustomizeLayerOption {
  isEnabled: boolean
  showRuntimeAddedLayers?: boolean
  hiddenJimuLayerViewIds?: string[]
  // After 2024.R3 we will use white-list for customization, see #21494.
  showJimuLayerViewIds?: string[]
  // Group layers (by jimuLayerViewId) for which any descendant layer is
  // automatically shown in the deployed app, regardless of whether it is
  // listed in showJimuLayerViewIds. Lets web-map authors add new sub-layers
  // to a group without having to re-edit and republish the widget config.
  autoIncludeChildrenGroupIds?: string[]
}
export type IMConfig = ImmutableObject<Config>
