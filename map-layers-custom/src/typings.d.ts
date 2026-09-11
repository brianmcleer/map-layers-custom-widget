// Widget-specific, type-only declarations for Visual Studio (EB 1.21, mode B).
//
// The shared editor master, src/exb-editor-shims.d.ts, is copied unchanged from the
// widget family and must stay byte-identical, so everything this widget needs on top
// of it lives here. Ambient module declarations with the same name merge, and a
// declaration for a specific path (for example 'jimu-icons/outlined/editor/filter')
// wins over the master's wildcard ('jimu-icons/*'). Nothing here affects the webpack
// build, which resolves the real modules.

/* ---- jimu-core members this widget imports that the master does not list ---- */
declare module 'jimu-core' {
  export const MutableStoreManager: any
  export const isKeyboardMode: (...args: any[]) => boolean
  export const ExBAddedJSAPIProperties: any
  export const SupportedJSAPILayerTypes: any
  export const AllDataSourceTypes: any
  export const CONSTANTS: any
  export const semver: any
  export namespace extensionSpec {
    export interface AppConfigOperationsExtension { [key: string]: any }
  }
  export type MapDataSource = any
  export const DataSourceTypes: any
  export type ResourceSessions = any
  export type DuplicateContext = any
  export type SerializedStyles = any
  // The master declares these as values only; the widget also uses them as types.
  export type BaseVersionManager = any
}

/* ---- jimu-arcgis ---- */
declare module 'jimu-arcgis' {
  export const zoomToUtils: any
  export const mapViewUtils: any
  export type JimuLayerView = any
}

/* ---- jimu-ui ---- */
declare module 'jimu-ui' {
  export const WidgetPlaceholder: any
  export const DataActionList: any
  export const getFocusableElements: (...args: any[]) => any[]
  export const LoadingType: any
}

declare module 'jimu-ui/advanced/setting-components' {
  export const LayerSetting: any
  export const getAllItemsInMapView: (...args: any[]) => any
}

declare module 'jimu-ui/advanced/map' {
  export const SymbolList: any
  export const JimuSymbolType: any
  export type JimuSymbolType = any
  const anything: any
  export default anything
}

declare module 'jimu-ui/advanced/data-source-selector' {
  export const DataSourceSelector: any
  const anything: any
  export default anything
}

/* ---- jimu-icons: named exports the master's wildcard (default export only) lacks ---- */
declare module 'jimu-icons/outlined/data/table' { export const TableOutlined: any }
declare module 'jimu-icons/outlined/directional/down' { export const DownOutlined: any }
declare module 'jimu-icons/outlined/directional/up' { export const UpOutlined: any }
declare module 'jimu-icons/outlined/editor/change-symbol' { export const ChangeSymbolOutlined: any }
declare module 'jimu-icons/outlined/editor/filter' { export const FilterOutlined: any }
declare module 'jimu-icons/outlined/editor/select-option' { export const SelectOptionOutlined: any }
declare module 'jimu-icons/outlined/editor/trash' { export const TrashOutlined: any }
declare module 'jimu-icons/outlined/application/range' { export const RangeOutlined: any }
declare module 'jimu-icons/outlined/application/transparency' { export const TransparencyOutlined: any }
declare module 'jimu-icons/filled/data/placeholder-map' { export const PlaceholderMapFilled: any }

/* ---- esri modules imported with a namespace import (the wildcard only has a default) ---- */
declare module 'esri/core/reactiveUtils' {
  export function watch (getValue: () => any, callback: (value: any, oldValue?: any) => void, options?: any): any
  export function when (getValue: () => any, callback: (value: any, oldValue?: any) => void, options?: any): any
  export function on (...args: any[]): any
  export function once (...args: any[]): any
}

/* ---- runtime dependency declared in package.json (bundled by webpack) ---- */
declare module 'shpjs' {
  const parseShapefile: (input: ArrayBuffer | Uint8Array | string) => Promise<any>
  export default parseShapefile
}
