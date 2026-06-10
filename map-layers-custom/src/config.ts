import type { ImmutableObject } from 'jimu-core'

export interface Config {
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
  customizeLayerOptions?: {
    [jimuMapViewId: string]: CustomizeLayerOption
  }
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
