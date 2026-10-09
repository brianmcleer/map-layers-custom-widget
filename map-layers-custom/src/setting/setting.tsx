/** @jsx jsx */
import {
  React,
  Immutable,
  type ImmutableObject,
  type DataSourceJson,
  type IMState,
  FormattedMessage,
  jsx,
  getAppStore,
  type UseDataSource,
  AllDataSourceTypes,
  type WidgetJson
} from 'jimu-core'
import { Switch, Radio, Label, Alert, Checkbox, TextInput, TextArea, Button, defaultMessages as jimuDefaultMessages } from 'jimu-ui'
import {
  MapWidgetSelector,
  SettingSection,
  SettingRow,
  LayerSetting,
  getAllItemsInMapView
} from 'jimu-ui/advanced/setting-components'
import { DataSourceSelector } from 'jimu-ui/advanced/data-source-selector'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import type { Config, IMConfig } from '../config'
import defaultMessages from './translations/default'
import MapThumb from './components/map-thumb'
import { getStyle } from './lib/style'
import { type JimuMapView, JimuMapViewComponent, MapViewManager } from 'jimu-arcgis'
import { visibleLayerIds } from '../runtime/lib/share-link'
import { DEFAULT_MEMORY_URL, namesAsDefaultTs } from '../runtime/lib/layer-name-i18n'
import type { PresetView } from '../config'
import { __setIntl, __t } from './i18n-t'

const allDefaultMessages = Object.assign({}, defaultMessages, jimuDefaultMessages)

interface ExtraProps {
  dsJsons: ImmutableObject<{ [dsId: string]: DataSourceJson }>
}

export interface WidgetSettingState {
  useMapWidget: boolean
  viewIdsFromMapWidget: string[]
  mapViews: { [viewId: string]: JimuMapView }
  activeCustomizeJmvId: string
  // List of GroupLayers in the currently active jimuMapView, used to render
  // the per-group "auto-include new sub-layers" toggles.
  groupLayerInfos: Array<{ jlvId: string, title: string }>
  // Whether loadGroupLayerInfos has finished running for the active view.
  // Drives the empty-state message versus a "loading" placeholder.
  groupLayerInfosLoaded: boolean
  // Transient feedback for the XML import/export of settings.
  importStatus?: { kind: 'success' | 'error', message: string }
  // GroupLayers per map view, for the "Pick one layer per group" switches.
  // Keyed by jimuMapViewId; a key present in pickOneLoaded means the walk for
  // that view has finished (drives the loading versus empty-state message).
  pickOneGroupInfos: { [jmvId: string]: Array<{ jlvId: string, title: string }> }
  pickOneLoaded: { [jmvId: string]: boolean }
}

export type WidgetSettingProps = AllWidgetSettingProps<IMConfig> & ExtraProps & {
  // Builder-injected properties that are missing from some EB 1.21 editor
  // type surfaces even though they are present at runtime.
  id: string
  useDataSources?: UseDataSource[] | any
  useMapWidgetIds?: string[] | any
}

export default class Setting extends React.PureComponent<
WidgetSettingProps,
WidgetSettingState
> {
  // Type-only declarations for Visual Studio under the EB 1.21 pnpm layout.
  // They restore the React instance members when VS fails to follow React's
  // inherited type declarations. `declare` fields emit no JavaScript.
  declare readonly props: Readonly<WidgetSettingProps>
  declare state: Readonly<WidgetSettingState>
  declare setState: (
    state: Partial<WidgetSettingState> | ((previousState: Readonly<WidgetSettingState>, props: Readonly<WidgetSettingProps>) => Partial<WidgetSettingState> | null),
    callback?: () => void
  ) => void

  supportedDsTypes = Immutable([
    AllDataSourceTypes.WebMap,
    AllDataSourceTypes.WebScene
  ])

  customizeLayersTrigger = React.createRef<HTMLDivElement>()
  // Hidden file input used by the "Import settings" button.
  importFileRef = React.createRef<HTMLInputElement>()

  // Config keys that the XML import/export covers: the Options and Enhanced
  // options. The map selection is deliberately excluded (no useMapWidgetIds,
  // no useMapWidget source toggle, no per-map customizeLayerOptions), so a file
  // can be moved between apps without dragging a specific map's layers along.
  static readonly PORTABLE_KEYS: Array<keyof Config> = [
    'goto', 'label', 'opacity', 'information', 'setVisibility', 'enableLegend',
    'useTickBoxes', 'showAllLegend', 'reorderLayers', 'searchLayers',
    'expandAllLayers', 'showTables', 'popup', 'visibilityRange', 'layerBatchOptions',
    'changeSymbolForRuntimeLayers', 'soloLayer', 'showLayerCount', 'collapsibleList',
    'startCollapsed', 'filterPlaceholder', 'enableLayerViews', 'autoShowParentLayers',
    'extraLayerTools', 'enableAddLayer', 'enableMasterOpacity', 'enableBasemapSwitcher',
    'enableLegendPanel', 'toolFlash', 'toolCopyUrl', 'toolRefresh', 'toolDetails',
    'toolSpotlight', 'toolMove', 'symbolOption', 'enablePickOneGroups',
    'enableShareLink', 'telemetryLayers', 'reportBrokenLayers', 'searchLayerDescriptions', 'enableLayerCsv',
    'enableLayerHealth', 'layerHealthMinutes', 'cleanLayerNames', 'cleanNamePrefix', 'cleanNameTitleCase',
    'enableFavorites', 'enableImageryIndex', 'imageryIndexUrl', 'toolZoomToScale',
    'translateLayerNames', 'layerNamesFromMemory', 'layerNameMemoryUrl', 'layerNameMtUrl', 'layerNameMtKey', 'layerNameKeep', 'layerNameOverrides'
  ]

  static mapExtraStateProps = (state: IMState): ExtraProps => {
    return {
      dsJsons: state.appStateInBuilder.appConfig.dataSources
    }
  }

  constructor (props) {
    super(props)
    this.state = {
      mapViews: null,
      useMapWidget: this.props.config.useMapWidget || false,
      viewIdsFromMapWidget: null,
      activeCustomizeJmvId: '',
      groupLayerInfos: [],
      groupLayerInfosLoaded: false,
      importStatus: null,
      pickOneGroupInfos: {},
      pickOneLoaded: {}
    }
    // this.setDefaultConfig()
  }

  setDefaultConfig() {
    if (this.props.config?.showTables === undefined) {
      this.props.onSettingChange({
        id: this.props.id,
        config: this.props.config.set('showTables', true)
      })
    }
  }

  getTranslatedString (stringId: string) {
    return this.props.intl.formatMessage({
      id: stringId,
      defaultMessage: allDefaultMessages[stringId]
    })
  }

  getFormattedMessage (stringId: string) {
    return <FormattedMessage id={stringId} defaultMessage={allDefaultMessages[stringId]} />
  }

  // ----- Import / export of the Options + Enhanced options as XML -----------
  buildSettingsXml = (): string => {
    const cfg: any = this.props.config ? this.props.config.asMutable({ deep: true }) : {}
    const esc = (s: any) => String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    const lines: string[] = []
    lines.push('<?xml version="1.0" encoding="UTF-8"?>')
    lines.push('<mapLayersCustomSettings schemaVersion="1">')
    Setting.PORTABLE_KEYS.forEach((k) => {
      const v = cfg[k as string]
      if (v === undefined || v === null) return
      const type = typeof v
      if (type !== 'boolean' && type !== 'number' && type !== 'string') return
      lines.push(`  <option key="${esc(k)}" type="${type}">${esc(v)}</option>`)
    })
    lines.push('</mapLayersCustomSettings>')
    return lines.join('\n')
  }

  exportSettingsXml = () => {
    try {
      const xml = this.buildSettingsXml()
      const blob = new Blob([xml], { type: 'text/xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'map-layers-custom-settings.xml'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
    } catch (e) {
      this.setState({ importStatus: { kind: 'error', message: this.getTranslatedString('exportError') } })
    }
  }

  parseSettingsXml = (text: string): Partial<Config> => {
    const doc = new DOMParser().parseFromString(text, 'text/xml')
    if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('parse')
    const root = doc.documentElement
    if (!root || root.nodeName !== 'mapLayersCustomSettings') throw new Error('root')
    const allowed = new Set<string>(Setting.PORTABLE_KEYS as string[])
    const out: any = {}
    const opts = root.getElementsByTagName('option')
    for (let i = 0; i < opts.length; i++) {
      const el = opts[i]
      const key = el.getAttribute('key')
      if (!key || !allowed.has(key)) continue   // ignore anything outside the portable option set
      const type = el.getAttribute('type') || 'string'
      const raw = el.textContent != null ? el.textContent : ''
      if (type === 'boolean') {
        out[key] = (raw.trim() === 'true')
      } else if (type === 'number') {
        const n = Number(raw)
        if (!Number.isNaN(n)) out[key] = n
      } else {
        out[key] = raw
      }
    }
    return out
  }

  onImportFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files && input.files[0]
    if (!file) return
    const finish = (status: { kind: 'success' | 'error', message: string }) => {
      this.setState({ importStatus: status })
      input.value = ''   // allow re-importing the same file
    }
    file.text().then((text) => {
      let parsed: Partial<Config>
      try {
        parsed = this.parseSettingsXml(text)
      } catch (err) {
        finish({ kind: 'error', message: this.getTranslatedString('importError') }); return
      }
      const keys = Object.keys(parsed)
      if (keys.length === 0) {
        finish({ kind: 'error', message: this.getTranslatedString('importEmpty') }); return
      }
      let cfg = this.props.config || Immutable({} as Config)
      keys.forEach((k) => { cfg = cfg.set(k, (parsed as any)[k]) })
      this.props.onSettingChange({ id: this.props.id, config: cfg })
      finish({ kind: 'success', message: this.getTranslatedString('importSuccess') })
    }).catch(() => {
      finish({ kind: 'error', message: this.getTranslatedString('importError') })
    })
  }

  getSwitchOption(optionKeys: keyof Omit<Config, 'customizeLayerOptions' | 'symbolOption'>, stringKey?: string) {
    return (
      <React.Fragment>
        <SettingRow tag='label' label={this.getFormattedMessage(stringKey || optionKeys)} >
        <Switch
          className="can-x-switch"
          checked={!!(this.props.config && this.props.config[optionKeys])}
          data-key={optionKeys}
          onChange={(evt) => {
            this.onOptionsChanged(evt.target.checked, optionKeys)
          }}
        />
        </SettingRow>
      </React.Fragment>
    )
  }

  getPortUrl = (): string => {
    const portUrl = getAppStore().getState().portalUrl
    return portUrl
  }

  shouldShowCustomizeLayerOptions = () => {
    return this.props.useMapWidgetIds?.length > 0
  }

  shouldShowLayerList = () => {
    return !this.isDataSourceEmpty()
  }

  isCustomizeOptionEmpty = () => {
    return this.isDataSourceEmpty() && !this.shouldShowCustomizeWarning()
  }

  onMapModeChange = (useMapWidget) => {
    const setting: Partial<WidgetJson> = {
      id: this.props.id,
      config: this.props.config.set('useMapWidget', useMapWidget)
    }

    // Clean up map id when switching to the ds mode
    if (!useMapWidget) {
      setting.useMapWidgetIds = []
    }

    this.props.onSettingChange(setting as any)

    this.setState({
      useMapWidget: useMapWidget
    })
  }

  onOptionsChanged = (checked, name): void => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set(name, checked)
    })
  }

  onFilterPlaceholderChange = (evt): void => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('filterPlaceholder', evt.target.value)
    })
  }

  onToggleUseDataEnabled = (useDataSourcesEnabled: boolean) => {
    this.props.onSettingChange({
      id: this.props.id,
      useDataSourcesEnabled
    })
  }

  onDataSourceChange = (useDataSources: UseDataSource[]) => {
    if (!useDataSources) {
      return
    }

    this.props.onSettingChange({
      id: this.props.id,
      useDataSources: useDataSources
    })
  }

  onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    // Update mapViews when connect to another widget
    const mapViews = MapViewManager.getInstance().getJimuMapViewGroup(useMapWidgetIds[0])?.jimuMapViews || {}
    this.setState({
      mapViews: mapViews
    })

    this.props.onSettingChange({
      id: this.props.id,
      useMapWidgetIds: useMapWidgetIds
    })
  }

  onViewsCreate = (views: { [viewId: string]: JimuMapView }) => {
    const viewIdsFromMapWidget = Object.keys(views)
    this.setState({
      mapViews: views,
      viewIdsFromMapWidget
    }, () => {
      if (this.state.activeCustomizeJmvId) {
        this.loadGroupLayerInfos(this.state.activeCustomizeJmvId)
      }
      if (this.props.config?.enablePickOneGroups) {
        this.loadPickOneGroupInfos()
      }
    })
  }

  onListItemBodyClick = (dataSourceId: string) => {
    const jmvId = `${this.props.useMapWidgetIds?.[0]}-${dataSourceId}`
    this.setState({
      activeCustomizeJmvId: jmvId,
      groupLayerInfos: [],
      groupLayerInfosLoaded: false
    }, () => {
      this.loadGroupLayerInfos(jmvId)
    })
  }

  // Walk every layer in the active map view and collect each parent-style
  // layer's jimuLayerViewId + title. A "parent" here is anything users can
  // nest sub-layers under: GroupLayer is the common case in AGO Map Viewer,
  // but MapImageLayer and similar also expose nested children and may host
  // newly-added content. Waits for the view to be ready so we don't read an
  // empty layer collection on first call.
  loadGroupLayerInfos = async (jmvId: string) => {
    if (!jmvId) return
    let jmv: JimuMapView = this.state.mapViews?.[jmvId]
    if (!jmv) {
      const allViews = MapViewManager.getInstance().getJimuMapViewGroup(this.props.useMapWidgetIds?.[0])?.jimuMapViews || {}
      jmv = allViews[jmvId]
    }
    if (!jmv) {
      if (this.state.activeCustomizeJmvId === jmvId) {
        this.setState({ groupLayerInfos: [], groupLayerInfosLoaded: true })
      }
      return
    }

    // Wait for the view to settle. On a fresh settings panel the map is
    // often still loading when onListItemBodyClick fires.
    try {
      if (jmv.view && (jmv.view as any).when) {
        await (jmv.view as any).when()
      }
    } catch (e) { /* continue even if view rejects */ }

    if (!jmv.view?.map) {
      if (this.state.activeCustomizeJmvId === jmvId) {
        this.setState({ groupLayerInfos: [], groupLayerInfosLoaded: true })
      }
      return
    }

    const result = await this.collectParentLayers(jmv, new Set([
      'esri.layers.GroupLayer',
      'esri.layers.MapImageLayer',
      'esri.layers.TileLayer',
      'esri.layers.CatalogLayer'
    ]))

    if (this.state.activeCustomizeJmvId === jmvId) {
      this.setState({ groupLayerInfos: result, groupLayerInfosLoaded: true })
    }
  }

  // Walks every layer in a map view (loading each so nested collections are
  // ready) and returns the jimuLayerViewId + title of each layer whose class is
  // in `types`, in map order, without duplicates.
  collectParentLayers = async (jmv: JimuMapView, types: Set<string>): Promise<Array<{ jlvId: string, title: string }>> => {
    const result: Array<{ jlvId: string, title: string }> = []
    const seen = new Set<string>()

    const visit = async (layers: any) => {
      if (!layers) return
      const arr: any[] = []
      if (layers.forEach) {
        layers.forEach((l: any) => arr.push(l))
      } else if (Array.isArray(layers)) {
        arr.push(...layers)
      }
      for (const layer of arr) {
        if (!layer) continue
        if (layer.load && layer.loadStatus !== 'loaded') {
          try { await layer.load() } catch (e) { /* ignore */ }
        }
        if (types.has(layer.declaredClass)) {
          try {
            const jlvId = jmv.getJimuLayerViewIdByAPILayer(layer)
            if (jlvId && !seen.has(jlvId)) {
              seen.add(jlvId)
              result.push({ jlvId, title: layer.title || layer.id || jlvId })
            }
          } catch (e) { /* ignore unresolved */ }
        }
        // Recurse into nested children (groups can hold groups)
        if (layer.layers) await visit(layer.layers)
        else if (layer.sublayers) await visit(layer.sublayers)
      }
    }

    await visit(jmv.view.map.layers)
    return result
  }

  // ----- Pick one layer per group (radio buttons) ---------------------------

  // Every map view the connected map widget exposes, keyed by jimuMapViewId.
  getAllMapViews = (): { [jmvId: string]: JimuMapView } => {
    const fromState = this.state.mapViews
    if (fromState && Object.keys(fromState).length > 0) return fromState
    return MapViewManager.getInstance().getJimuMapViewGroup(this.props.useMapWidgetIds?.[0])?.jimuMapViews || {}
  }

  // Loads the GroupLayers of every map view for the pick-one switches. Only
  // true GroupLayers qualify: exclusive visibility is a GroupLayer feature.
  loadPickOneGroupInfos = async () => {
    const views = this.getAllMapViews()
    const ids = Object.keys(views)
    if (ids.length === 0) return
    for (const jmvId of ids) {
      const jmv = views[jmvId]
      let infos: Array<{ jlvId: string, title: string }> = []
      try {
        if (jmv?.view && (jmv.view as any).when) {
          await (jmv.view as any).when()
        }
        if (jmv?.view?.map) {
          infos = await this.collectParentLayers(jmv, new Set(['esri.layers.GroupLayer']))
        }
      } catch (e) { /* leave empty */ }
      this.setState((prev) => ({
        pickOneGroupInfos: { ...prev.pickOneGroupInfos, [jmvId]: infos },
        pickOneLoaded: { ...prev.pickOneLoaded, [jmvId]: true }
      }))
    }
  }

  isPickOneEnabled = (jmvId: string, jlvId: string): boolean => {
    const ids = this.props.config?.pickOneGroupIds?.[jmvId]
    return !!ids && ids.indexOf(jlvId) !== -1
  }

  onPickOneGroupChange = (jmvId: string, jlvId: string, enabled: boolean) => {
    const existing: string[] = Array.from(this.props.config?.pickOneGroupIds?.[jmvId] || [])
    const nextIds = enabled
      ? (existing.indexOf(jlvId) === -1 ? [...existing, jlvId] : existing)
      : existing.filter(id => id !== jlvId)
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.setIn(['pickOneGroupIds', jmvId], nextIds)
    })
  }

  onEnablePickOneChange = (enabled: boolean) => {
    this.onOptionsChanged(enabled, 'enablePickOneGroups')
    if (enabled) {
      this.setState({ pickOneGroupInfos: {}, pickOneLoaded: {} }, () => { this.loadPickOneGroupInfos() })
    }
  }

  // The per-view, per-group switch list shown under the pick-one option.
  getPickOneGroupList = () => {
    const views = this.getAllMapViews()
    const jmvIds = Object.keys(views)
    const multi = jmvIds.length > 1

    const rowsFor = (jmvId: string): React.ReactNode => {
      const infos = this.state.pickOneGroupInfos[jmvId]
      const loaded = !!this.state.pickOneLoaded[jmvId]
      if (!loaded) {
        return <div className='auto-include-empty'>{this.getTranslatedString('pickOneLoading')}</div>
      }
      if (!infos || infos.length === 0) {
        return <div className='auto-include-empty'>{this.getTranslatedString('pickOneNoGroups')}</div>
      }
      return infos.map(info => (
        <SettingRow key={info.jlvId} tag='label' label={info.title} className='auto-include-row'>
          <Switch
            className='can-x-switch'
            aria-label={`${this.getTranslatedString('pickOneAria')} ${info.title}`}
            checked={this.isPickOneEnabled(jmvId, info.jlvId)}
            onChange={(evt) => { this.onPickOneGroupChange(jmvId, info.jlvId, evt.target.checked) }}
          />
        </SettingRow>
      ))
    }

    const viewLabel = (jmvId: string): string => {
      const dsId = views[jmvId]?.dataSourceId
      return (dsId && this.props.dsJsons?.[dsId]?.label) || dsId || jmvId
    }

    return (
      <div className='auto-include-section w-100' role='group' aria-label={this.getTranslatedString('enablePickOneGroups')}>
        <div className='auto-include-header-row'>
          <Label className='auto-include-header'>{this.getTranslatedString('pickOneGroupsLabel')}</Label>
          <a
            className='auto-include-refresh'
            role='button'
            tabIndex={0}
            onClick={() => { this.loadPickOneGroupInfos() }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { this.loadPickOneGroupInfos() }
            }}
          >
            {this.getTranslatedString('pickOneRefresh')}
          </a>
        </div>
        <div className='auto-include-desc'>{this.getTranslatedString('pickOneDesc')}</div>
        {jmvIds.length === 0 && <div className='auto-include-empty'>{this.getTranslatedString('pickOneLoading')}</div>}
        {jmvIds.map(jmvId => (
          <div key={jmvId}>
            {multi && <div className='auto-include-desc'><strong>{viewLabel(jmvId)}</strong></div>}
            {rowsFor(jmvId)}
          </div>
        ))}
      </div>
    )
  }

  // ----- Preset views (captured in the builder, read-only in the app) -----

  getPresets = (jmvId: string): PresetView[] => {
    const raw: any = this.props.config?.presetViews?.[jmvId]
    return raw ? (raw.asMutable ? raw.asMutable({ deep: true }) : Array.from(raw)) : []
  }

  setPresets = (jmvId: string, next: PresetView[]) => {
    this.props.onSettingChange({ id: this.props.id, config: this.props.config.setIn(['presetViews', jmvId], next) })
  }

  // The layers currently on in the builder's copy of the map view.
  captureLayerIds = (jmvId: string): string[] | null => {
    const jmv = this.getAllMapViews()[jmvId]
    const allLayers = jmv?.view?.map?.allLayers
    if (!allLayers) return null
    return visibleLayerIds(allLayers)
  }

  onAddPreset = (jmvId: string) => {
    const ids = this.captureLayerIds(jmvId)
    if (!ids) return
    const presets = this.getPresets(jmvId)
    presets.push({ id: `preset-${Date.now()}`, name: `${this.getTranslatedString('presetDefaultName')} ${presets.length + 1}`, layerIds: ids })
    this.setPresets(jmvId, presets)
  }

  onUpdatePreset = (jmvId: string, id: string) => {
    const ids = this.captureLayerIds(jmvId)
    if (!ids) return
    this.setPresets(jmvId, this.getPresets(jmvId).map(p => (p.id === id ? { ...p, layerIds: ids } : p)))
  }

  onRenamePreset = (jmvId: string, id: string, name: string) => {
    this.setPresets(jmvId, this.getPresets(jmvId).map(p => (p.id === id ? { ...p, name } : p)))
  }

  onDeletePreset = (jmvId: string, id: string) => {
    this.setPresets(jmvId, this.getPresets(jmvId).filter(p => p.id !== id))
  }

  onMovePreset = (jmvId: string, id: string, delta: number) => {
    const presets = this.getPresets(jmvId)
    const i = presets.findIndex(p => p.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= presets.length) return
    const [moved] = presets.splice(i, 1)
    presets.splice(j, 0, moved)
    this.setPresets(jmvId, presets)
  }

  getPresetViewsSection = () => {
    const views = this.getAllMapViews()
    const jmvIds = Object.keys(views)
    const multi = jmvIds.length > 1
    const viewLabel = (jmvId: string): string => {
      const dsId = views[jmvId]?.dataSourceId
      return (dsId && this.props.dsJsons?.[dsId]?.label) || dsId || jmvId
    }
    return (
      <div className='auto-include-section w-100' role='group' aria-label={this.getTranslatedString('presetViewsLabel')}>
        <div className='auto-include-header-row'>
          <Label className='auto-include-header'>{this.getTranslatedString('presetViewsLabel')}</Label>
        </div>
        <div className='auto-include-desc'>{this.getTranslatedString('presetViewsDesc')}</div>
        {jmvIds.length === 0 && <div className='auto-include-empty'>{this.getTranslatedString('pickOneLoading')}</div>}
        {jmvIds.map(jmvId => {
          const presets = this.getPresets(jmvId)
          return (
            <div key={jmvId}>
              {multi && <div className='auto-include-desc'><strong>{viewLabel(jmvId)}</strong></div>}
              {presets.length === 0 && <div className='auto-include-empty'>{this.getTranslatedString('presetNone')}</div>}
              {presets.map((p, i) => (
                <div key={p.id} className='preset-row'>
                  <TextInput
                    size='sm'
                    className='w-100'
                    value={p.name}
                    aria-label={this.getTranslatedString('presetName')}
                    onChange={(evt) => { this.onRenamePreset(jmvId, p.id, evt.target.value) }}
                  />
                  <div className='preset-row-meta'>
                    <span className='preset-row-count'>{`${p.layerIds.length} ${this.getTranslatedString('presetLayersOn')}`}</span>
                    <Button size='sm' type='tertiary' onClick={() => { this.onUpdatePreset(jmvId, p.id) }} title={this.getTranslatedString('presetUpdateHint')}>{this.getTranslatedString('presetUpdate')}</Button>
                    <Button size='sm' type='tertiary' icon disabled={i === 0} aria-label={this.getTranslatedString('presetMoveUp')} title={this.getTranslatedString('presetMoveUp')} onClick={() => { this.onMovePreset(jmvId, p.id, -1) }}>↑</Button>
                    <Button size='sm' type='tertiary' icon disabled={i === presets.length - 1} aria-label={this.getTranslatedString('presetMoveDown')} title={this.getTranslatedString('presetMoveDown')} onClick={() => { this.onMovePreset(jmvId, p.id, 1) }}>↓</Button>
                    <Button size='sm' type='tertiary' aria-label={`${this.getTranslatedString('presetDelete')}: ${p.name}`} onClick={() => { this.onDeletePreset(jmvId, p.id) }}>{this.getTranslatedString('presetDelete')}</Button>
                  </div>
                </div>
              ))}
              <Button size='sm' type='primary' className='mt-2' onClick={() => { this.onAddPreset(jmvId) }}>{this.getTranslatedString('presetAdd')}</Button>
            </div>
          )
        })}
      </div>
    )
  }

  isAutoIncludeEnabled = (jlvId: string): boolean => {
    const ids = this.props.config?.customizeLayerOptions?.[this.state.activeCustomizeJmvId]?.autoIncludeChildrenGroupIds
    return !!ids && ids.indexOf(jlvId) !== -1
  }

  onAutoIncludeGroupChange = (jlvId: string, enabled: boolean) => {
    const jmvId = this.state.activeCustomizeJmvId
    if (!jmvId) return

    const existing: string[] = Array.from(this.props.config?.customizeLayerOptions?.[jmvId]?.autoIncludeChildrenGroupIds || [])
    let nextIds: string[]
    if (enabled) {
      nextIds = existing.indexOf(jlvId) === -1 ? [...existing, jlvId] : [...existing]
    } else {
      nextIds = existing.filter(id => id !== jlvId)
    }

    let newConfig = this.props.config.setIn(
      ['customizeLayerOptions', jmvId, 'autoIncludeChildrenGroupIds'],
      nextIds
    )

    // When turning auto-include ON, also ensure the group itself is in the
    // whitelist. Otherwise the group would be hidden and its (auto-included)
    // children would have no visible parent in the layer tree.
    if (enabled) {
      const showIds = this.props.config?.customizeLayerOptions?.[jmvId]?.showJimuLayerViewIds
      if (showIds && showIds.indexOf(jlvId) === -1) {
        newConfig = newConfig.setIn(
          ['customizeLayerOptions', jmvId, 'showJimuLayerViewIds'],
          [...showIds, jlvId]
        )
      }
    }

    this.props.onSettingChange({
      id: this.props.id,
      config: newConfig
    })
  }

  getActiveCustomizeStatus = () => {
    return this.props.config?.customizeLayerOptions?.[this.state.activeCustomizeJmvId]?.isEnabled || false
  }

  // Renders the "Enhanced options" group: the extra power features added by
  // this custom fork. Only shown in map-widget mode where they apply.
  // Indented sub-switch that defaults to ON (undefined === enabled).
  getToolSwitch = (key: string, labelKey: string) => {
    return (
      <SettingRow tag='label' label={this.getTranslatedString(labelKey)} className='ml-3'>
        <Switch
          className='can-x-switch'
          checked={(this.props.config ? (this.props.config as any)[key] !== false : true)}
          data-key={key}
          onChange={(evt) => { this.onOptionsChanged(evt.target.checked, key) }}
        />
      </SettingRow>
    )
  }

  // Indented sub-switch that defaults to OFF.
  getToolSwitchOff = (key: string, labelKey: string) => {
    return (
      <SettingRow tag='label' label={this.getTranslatedString(labelKey)} className='ml-3'>
        <Switch
          className='can-x-switch'
          checked={!!(this.props.config && (this.props.config as any)[key])}
          data-key={key}
          onChange={(evt) => { this.onOptionsChanged(evt.target.checked, key) }}
        />
      </SettingRow>
    )
  }

  // ---- Layer names in the app language ----
  setConfigValue = (key: string, value: any) => {
    this.props.onSettingChange({ id: this.props.id, config: this.props.config.set(key, value) })
  }

  // Every layer title in the builder's map views (groups and sublayers included).
  collectNames = (): string[] => {
    const out: string[] = []
    const views: any = this.getAllMapViews() || {}
    for (const id of Object.keys(views)) {
      const all = views[id]?.view?.map?.allLayers
      const arr = all ? (all.toArray ? all.toArray() : all) : []
      for (const l of arr) {
        if (l?.title) out.push(String(l.title))
        const subs = l?.allSublayers ? (l.allSublayers.toArray ? l.allSublayers.toArray() : l.allSublayers) : []
        for (const s of subs) if (s?.title) out.push(String(s.title))
      }
    }
    return Array.from(new Set(out.map(s => s.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }

  onCollectNames = () => {
    const names = this.collectNames()
    const raw: any = this.props.config?.layerNameOverrides
    const current: any = raw ? (raw.asMutable ? raw.asMutable({ deep: true }) : { ...raw }) : {}
    for (const n of names) if (!current[n]) current[n] = {}
    this.setConfigValue('layerNameOverrides', current)
    this.setState({ layerNameText: JSON.stringify(current, null, 2), layerNameMsg: this.getTranslatedString('collectLayerNamesDone').replace('{count}', String(names.length)) } as any)
    try { (navigator as any).clipboard?.writeText(namesAsDefaultTs(names)) } catch (e) { /* clipboard blocked */ }
  }

  getLayerNameLanguageContent = () => {
    const cfg: any = this.props.config || {}
    const plain = (v: any) => (v && typeof v.asMutable === 'function' ? v.asMutable({ deep: true }) : v)
    const st: any = this.state || {}
    const overridesText = st.layerNameText ?? JSON.stringify(plain(cfg.layerNameOverrides) || {}, null, 2)
    const keepText = st.layerNameKeepText ?? (plain(cfg.layerNameKeep) || []).join('\n')
    return (
      <React.Fragment>
        <SettingRow flow='wrap' className='ml-3'>
          <Label className='enhanced-options-desc'>{this.getTranslatedString('translateLayerNamesHint')}</Label>
        </SettingRow>
        {this.getToolSwitch('layerNamesFromMemory', 'layerNamesFromMemory')}
        {cfg.layerNamesFromMemory !== false &&
          <SettingRow flow='wrap' label={this.getFormattedMessage('layerNameMemoryUrl')} className='ml-3'>
            <TextInput className='w-100' size='sm' value={cfg.layerNameMemoryUrl || ''} placeholder={DEFAULT_MEMORY_URL}
              onChange={(evt) => { this.setConfigValue('layerNameMemoryUrl', evt.target.value) }} />
          </SettingRow>
        }
        <SettingRow flow='wrap' label={this.getFormattedMessage('layerNameMtUrl')} className='ml-3'>
          <TextInput className='w-100' size='sm' value={cfg.layerNameMtUrl || ''} placeholder='https://libretranslate.example.org'
            onChange={(evt) => { this.setConfigValue('layerNameMtUrl', evt.target.value) }} />
        </SettingRow>
        {!!cfg.layerNameMtUrl &&
          <SettingRow flow='wrap' label={this.getFormattedMessage('layerNameMtKey')} className='ml-3'>
            <TextInput className='w-100' size='sm' type='password' value={cfg.layerNameMtKey || ''}
              onChange={(evt) => { this.setConfigValue('layerNameMtKey', evt.target.value) }} />
          </SettingRow>
        }
        <SettingRow flow='wrap' label={this.getFormattedMessage('layerNameKeep')} className='ml-3'>
          <TextArea className='w-100' height={80} value={keepText}
            onChange={(evt: any) => {
              const text = String(evt.target.value)
              this.setState({ layerNameKeepText: text } as any)
              this.setConfigValue('layerNameKeep', text.split(/\r?\n/).map(s => s.trim()).filter(Boolean))
            }} />
        </SettingRow>
        <SettingRow flow='wrap' className='ml-3'>
          <Button size='sm' type='secondary' onClick={this.onCollectNames}>{this.getTranslatedString('collectLayerNames')}</Button>
          <Label className='enhanced-options-desc mt-1'>{st.layerNameMsg || this.getTranslatedString('collectLayerNamesHint')}</Label>
        </SettingRow>
        <SettingRow flow='wrap' label={this.getFormattedMessage('layerNameOverrides')} className='ml-3'>
          <TextArea className='w-100' height={160} value={overridesText}
            onChange={(evt: any) => {
              const text = String(evt.target.value)
              let ok = true
              try { const obj = JSON.parse(text || '{}'); if (obj && typeof obj === 'object' && !Array.isArray(obj)) this.setConfigValue('layerNameOverrides', obj); else ok = false } catch (e) { ok = false }
              this.setState({ layerNameText: text, layerNameMsg: ok ? '' : this.getTranslatedString('layerNameOverridesBad') } as any)
            }} />
        </SettingRow>
      </React.Fragment>
    )
  }

  getEnhancedOptionsContent = () => {
    const collapsibleOn = !!(this.props.config && this.props.config.collapsibleList)
    const searchOn = !!(this.props.config && this.props.config.searchLayers)
    const extraToolsOn = !!(this.props.config && this.props.config.extraLayerTools)
    const pickOneOn = !!(this.props.config && this.props.config.enablePickOneGroups)
    const healthOn = !!(this.props.config && this.props.config.enableLayerHealth)
    const addLayerOn = !!(this.props.config && this.props.config.enableAddLayer)
    const cleanOn = !!(this.props.config && this.props.config.cleanLayerNames)
    return (
      <React.Fragment>
        <SettingRow tag='label' label={this.getFormattedMessage('autoShowParentLayers')}>
          <Switch
            className='can-x-switch'
            checked={(this.props.config ? this.props.config.autoShowParentLayers !== false : true)}
            data-key='autoShowParentLayers'
            onChange={(evt) => { this.onOptionsChanged(evt.target.checked, 'autoShowParentLayers') }}
          />
        </SettingRow>
        {this.getSwitchOption('soloLayer')}
        <SettingRow tag='label' label={this.getFormattedMessage('enablePickOneGroups')}>
          <Switch
            className='can-x-switch'
            checked={pickOneOn}
            data-key='enablePickOneGroups'
            onChange={(evt) => { this.onEnablePickOneChange(evt.target.checked) }}
          />
        </SettingRow>
        {pickOneOn && this.getPickOneGroupList()}
        {this.getSwitchOption('enableShareLink')}
        {(this.props.config?.enableShareLink && !this.props.config?.layerBatchOptions) &&
          <SettingRow flow='wrap'>
            <Label className='enhanced-options-desc'>{this.getTranslatedString('shareLinkNeedsBatch')}</Label>
          </SettingRow>
        }
        {this.getToolSwitch('telemetryLayers', 'telemetryLayers')}
        {this.getToolSwitch('reportBrokenLayers', 'reportBrokenLayers')}
        {this.getSwitchOption('enableLayerCsv')}
        {(this.props.config?.enableLayerCsv && !this.props.config?.layerBatchOptions) &&
          <SettingRow flow='wrap'>
            <Label className='enhanced-options-desc'>{this.getTranslatedString('layerCsvNeedsBatch')}</Label>
          </SettingRow>
        }
        {this.getSwitchOption('enableLayerHealth')}
        {healthOn &&
          <SettingRow flow='wrap' label={this.getFormattedMessage('layerHealthMinutes')} className='ml-3'>
            <TextInput
              className='w-100'
              size='sm'
              type='number'
              min={1}
              max={120}
              value={String(this.props.config?.layerHealthMinutes ?? 5)}
              onChange={(evt) => {
                const n = Math.max(1, Math.min(120, Math.round(Number(evt.target.value)) || 5))
                this.props.onSettingChange({ id: this.props.id, config: this.props.config.set('layerHealthMinutes', n) })
              }}
            />
          </SettingRow>
        }
        {this.getSwitchOption('extraLayerTools')}
        {extraToolsOn &&
          <React.Fragment>
            {this.getToolSwitch('toolFlash', 'flashLayer')}
            {this.getToolSwitch('toolCopyUrl', 'copyUrl')}
            {this.getToolSwitch('toolRefresh', 'refreshLayer')}
            {this.getToolSwitch('toolDetails', 'layerDetails')}
            {this.getToolSwitch('toolSpotlight', 'spotlight')}
            {this.getToolSwitch('toolMove', 'moveLayer')}
            {this.getToolSwitch('toolZoomToScale', 'zoomToScale')}
          </React.Fragment>
        }
        {this.getSwitchOption('enableAddLayer')}
        {addLayerOn && this.getToolSwitchOff('enableImageryIndex', 'enableImageryIndex')}
        {addLayerOn && this.props.config?.enableImageryIndex &&
          <SettingRow flow='wrap' label={this.getFormattedMessage('imageryIndexUrl')} className='ml-3'>
            <TextInput
              className='w-100'
              size='sm'
              value={this.props.config?.imageryIndexUrl || ''}
              placeholder='https://osmlab.github.io/editor-layer-index/imagery.geojson'
              onChange={(evt) => { this.props.onSettingChange({ id: this.props.id, config: this.props.config.set('imageryIndexUrl', evt.target.value) }) }}
            />
          </SettingRow>
        }
        {this.getSwitchOption('enableFavorites')}
        {this.getSwitchOption('cleanLayerNames')}
        {cleanOn &&
          <React.Fragment>
            <SettingRow flow='wrap' label={this.getFormattedMessage('cleanNamePrefix')} className='ml-3'>
              <TextInput
                className='w-100'
                size='sm'
                value={this.props.config?.cleanNamePrefix || ''}
                placeholder={this.getTranslatedString('cleanNamePrefixHint')}
                onChange={(evt) => { this.props.onSettingChange({ id: this.props.id, config: this.props.config.set('cleanNamePrefix', evt.target.value) }) }}
              />
            </SettingRow>
            {this.getToolSwitchOff('cleanNameTitleCase', 'cleanNameTitleCase')}
          </React.Fragment>
        }
        {this.getSwitchOption('translateLayerNames')}
        {this.props.config?.translateLayerNames && this.getLayerNameLanguageContent()}
        {this.getSwitchOption('enableMasterOpacity')}
        {this.getSwitchOption('enableBasemapSwitcher')}
        {this.getSwitchOption('enableLegendPanel')}
        {this.getSwitchOption('showLayerCount')}
        {this.getSwitchOption('enableLayerViews')}
        {this.getPresetViewsSection()}
        {this.getSwitchOption('collapsibleList')}
        {collapsibleOn &&
          <SettingRow tag='label' label={this.getFormattedMessage('startCollapsed')} className='ml-3'>
            <Switch
              className='can-x-switch'
              checked={(this.props.config && this.props.config.startCollapsed) || false}
              data-key='startCollapsed'
              onChange={(evt) => { this.onOptionsChanged(evt.target.checked, 'startCollapsed') }}
            />
          </SettingRow>
        }
        {searchOn && this.getToolSwitchOff('searchLayerDescriptions', 'searchLayerDescriptions')}
        {searchOn &&
          <SettingRow flow='wrap' label={this.getFormattedMessage('filterPlaceholderLabel')}>
            <TextInput
              className='w-100'
              size='sm'
              value={(this.props.config && this.props.config.filterPlaceholder) || ''}
              placeholder={this.getTranslatedString('filterPlaceholderHint')}
              onChange={this.onFilterPlaceholderChange}
            />
          </SettingRow>
        }
      </React.Fragment>
    )
  }

  getShowRuntimeAddedLayerStatus = () => {
    return this.props.config?.customizeLayerOptions?.[this.state.activeCustomizeJmvId]?.showRuntimeAddedLayers ?? true
  }

  getSelectedValues = () => {
    // For the app that has `showJimuLayerViewIds`, uses it directly
    const ret = {}
    const jmvId = this.state.activeCustomizeJmvId
    if (jmvId && this.props.config?.customizeLayerOptions?.[jmvId]) {
      if (this.props.config.customizeLayerOptions[jmvId].isEnabled && this.props.config.customizeLayerOptions[jmvId].showJimuLayerViewIds) {
        ret[jmvId] = this.props.config.customizeLayerOptions[jmvId].showJimuLayerViewIds
        return ret
      }
    }
    return { [this.state.activeCustomizeJmvId]: Immutable(getAllItemsInMapView(this.state.activeCustomizeJmvId, true)) }
  }

  onCustomizeLayerChange = (enable: boolean, jlvIds: string[]) => {
    // No matter it's on/off, clean up the ids array
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.setIn(['customizeLayerOptions', this.state.activeCustomizeJmvId], {
        isEnabled: enable,
        hiddenJimuLayerViewIds: [],
        // Store all layer ids when enabling customization
        showJimuLayerViewIds: enable ? [...jlvIds] : [],
        // Reset auto-include set when toggling — stale group ids from a
        // previously-customized state would be silently re-applied otherwise.
        autoIncludeChildrenGroupIds: []
      })
    })
    // Refresh group layer list now that customization is (re)enabled.
    if (enable) {
      this.loadGroupLayerInfos(this.state.activeCustomizeJmvId)
    }
  }

  onShowRuntimeAddedLayersChange = (enable) => {
    const newConfig = this.props.config.setIn(['customizeLayerOptions', this.state.activeCustomizeJmvId, 'showRuntimeAddedLayers'], enable)
    this.props.onSettingChange({
      id: this.props.id,
      config: newConfig
    })
  }

  onLayerIdChange = (showJimuLayerViewIds: string[]) => {
    const newConfig = this.props.config.setIn(['customizeLayerOptions', this.state.activeCustomizeJmvId, 'showJimuLayerViewIds'], showJimuLayerViewIds)

    this.props.onSettingChange({
      id: this.props.id,
      config: newConfig
    })
  }

  getCustomizeLayerList = () => {
    return (
      <div ref={this.customizeLayersTrigger} className='w-100'>
        <LayerSetting
          mapWidgetId={this.props.useMapWidgetIds?.[0]}
          onMapItemClick={this.onListItemBodyClick}
          mapViewId={this.state.activeCustomizeJmvId}
          isCustomizeEnabled={this.getActiveCustomizeStatus()}
          isShowRuntimeAddedLayerEnabled={this.getShowRuntimeAddedLayerStatus()}
          showTable={true}
          onToggleCustomize={this.onCustomizeLayerChange}
          onShowRuntimeAddedLayersChange={this.onShowRuntimeAddedLayersChange}
          onSelectedLayerIdChange={this.onLayerIdChange}
          selectedValues={this.getSelectedValues()}
        />
        {this.getAutoIncludeGroupList()}
      </div>
    )
  }

  // Renders a per-group "Auto-include new sub-layers" switch list. Always
  // visible while customization is enabled so users can discover it — shows
  // either the list of groups, a "loading" hint, or an empty-state message.
  getAutoIncludeGroupList = () => {
    if (!this.getActiveCustomizeStatus()) return null

    const infos = this.state.groupLayerInfos
    const loaded = this.state.groupLayerInfosLoaded

    let body: React.ReactNode
    if (!loaded) {
      body = (
        <div className='auto-include-empty'>
          {this.getTranslatedString('autoIncludeLoading')}
        </div>
      )
    } else if (!infos || infos.length === 0) {
      body = (
        <div className='auto-include-empty'>
          {this.getTranslatedString('autoIncludeNoGroups')}
        </div>
      )
    } else {
      body = infos.map(info => (
        <SettingRow
          key={info.jlvId}
          tag='label'
          label={info.title}
          className='auto-include-row'
        >
          <Switch
            className='can-x-switch'
            aria-label={`${this.getTranslatedString('autoIncludeAria')} ${info.title}`}
            checked={this.isAutoIncludeEnabled(info.jlvId)}
            onChange={(evt) => {
              this.onAutoIncludeGroupChange(info.jlvId, evt.target.checked)
            }}
          />
        </SettingRow>
      ))
    }

    return (
      <div className='auto-include-section w-100' role='group' aria-label={this.getTranslatedString('autoIncludeSectionLabel')}>
        <div className='auto-include-header-row'>
          <Label className='auto-include-header'>
            {this.getTranslatedString('autoIncludeSectionLabel')}
          </Label>
          <a
            className='auto-include-refresh'
            role='button'
            tabIndex={0}
            onClick={() => { this.loadGroupLayerInfos(this.state.activeCustomizeJmvId) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                this.loadGroupLayerInfos(this.state.activeCustomizeJmvId)
              }
            }}
          >
            {this.getTranslatedString('autoIncludeRefresh')}
          </a>
        </div>
        <div className='auto-include-desc'>
          {this.getTranslatedString('autoIncludeSectionDesc')}
        </div>
        {body}
      </div>
    )
  }

  getCustomizeSettingContent = () => {
    const label = <Label id='multiple-jimu-map-desc'>{this.getTranslatedString('customizeDescription')}</Label>
    return (
      this.shouldShowCustomizeLayerOptions() && (
        <React.Fragment>
          <SettingRow
            label={label}
            flow='wrap'
            aria-label={this.getTranslatedString('customizeDescription')}
            className={this.isCustomizeOptionEmpty() ? 'empty-customize-layer-list' : 'customize-layer-list'}
          >
            {this.shouldShowCustomizeWarning() &&
              <Alert
                tabIndex={0}
                className={'warningMsg'}
                open
                text={this.getTranslatedString('customizeLayerWarnings')}
                type={'warning'}
              />
            }
            {
              this.shouldShowLayerList() && this.getCustomizeLayerList()
            }
          </SettingRow>
        </React.Fragment>
      )
    )
  }

  shouldShowCustomizeWarning = (): boolean => {
    // Not connecting to a map widget
    if (!this.state.useMapWidget) {
      return true
    } else {
      return this.isDataSourceEmpty()
    }
  }

  isDataSourceEmpty = (): boolean => {
    const mapViews = MapViewManager.getInstance().getJimuMapViewGroup(this.props.useMapWidgetIds[0])?.jimuMapViews || {}
    // The connected widget only have ONE map view & have no data source
    if (Object.keys(mapViews).length === 1 && !(Object.values(mapViews) as any[])?.[0]?.dataSourceId) {
      return true
    } else {
      return false
    }
  }

  render () {
    __setIntl((this.props as any).intl)
    const portalUrl = this.getPortUrl()

    let setDataContent = null
    let dataSourceSelectorContent = null
    let mapSelectorContent = null
    let actionsContent = null
    let optionsContent = null

    dataSourceSelectorContent = (
      <div className="data-selector-section">
        <SettingRow>
          <DataSourceSelector
            types={this.supportedDsTypes}
            useDataSources={this.props.useDataSources}
            useDataSourcesEnabled
            mustUseDataSource
            onChange={this.onDataSourceChange}
            widgetId={this.props.id}
          />
        </SettingRow>
        {portalUrl &&
          this.props.dsJsons &&
          this.props.useDataSources &&
          this.props.useDataSources.length === 1 && (
            <SettingRow>
              <div className="w-100">
                <div
                  className="webmap-thumbnail"
                  title={
                    this.props.dsJsons[
                      this.props.useDataSources[0].dataSourceId
                    ]?.label
                  }
                >
                  <MapThumb
                    mapItemId={
                      this.props.dsJsons[
                        this.props.useDataSources[0].dataSourceId
                      ]
                        ? this.props.dsJsons[
                          this.props.useDataSources[0].dataSourceId
                        ].itemId
                        : null
                    }
                    portUrl={
                      this.props.dsJsons[
                        this.props.useDataSources[0].dataSourceId
                      ]
                        ? this.props.dsJsons[
                          this.props.useDataSources[0].dataSourceId
                        ].portalUrl
                        : null
                    }
                  />
                </div>
              </div>
            </SettingRow>
        )}
      </div>
    )

    mapSelectorContent = (
      <div className="map-selector-section">
        <SettingRow>
          <MapWidgetSelector
            onSelect={this.onMapWidgetSelected}
            useMapWidgetIds={this.props.useMapWidgetIds}
          />
        </SettingRow>
        <JimuMapViewComponent
          useMapWidgetId={this.props.useMapWidgetIds?.[0]}
          onViewsCreate={this.onViewsCreate}
        />
        {this.getCustomizeSettingContent()}
      </div>
    )

    if (this.state.useMapWidget) {
      setDataContent = mapSelectorContent

      actionsContent = (
        <React.Fragment>
          {this.getSwitchOption('goto')}
          {this.getSwitchOption('label', 'showOrHideLabels')}
          {this.getSwitchOption('popup')}
          {this.getSwitchOption('opacity', 'transparency')}
          {this.getSwitchOption('visibilityRange')}
          {this.getSwitchOption('information')}
          {this.getSwitchOption('changeSymbolForRuntimeLayers')}
        </React.Fragment>
      )

      optionsContent = (
        <React.Fragment>
          {this.getSwitchOption('useTickBoxes')}
          {this.getSwitchOption('enableLegend')}
          {
            (this.props.config && this.props.config.enableLegend) &&
            <SettingRow>
              <Label aria-label={this.getTranslatedString('showAllLegend')} className='cursor-pointer'>
                <Checkbox
                  className='mr-2'
                  checked={this.props.config && this.props.config.showAllLegend}
                  onChange={(evt) => {
                    this.onOptionsChanged(evt.target.checked, 'showAllLegend')
                  }}
                />
                <span className='check-box-label'>
                  {` ${this.getTranslatedString('showAllLegend')}`}
                </span>
              </Label>
            </SettingRow>
          }

          {this.getSwitchOption('reorderLayers')}
          {this.getSwitchOption('searchLayers')}
          {this.getSwitchOption('expandAllLayers', 'expandAllLayersByDefault')}
          {this.getSwitchOption('layerBatchOptions')}

          {this.getSwitchOption('showTables')}
        </React.Fragment>
      )
    } else {
      setDataContent = dataSourceSelectorContent
      actionsContent = (
        <React.Fragment>
          {this.getSwitchOption('information')}
        </React.Fragment>
      )
      optionsContent = (
        <React.Fragment>
          {this.getSwitchOption('expandAllLayers', 'expandAllLayersByDefault')}
          {this.getSwitchOption('layerBatchOptions')}
          {this.getSwitchOption('showTables')}
        </React.Fragment>
      )
    }

    return (
      <div css={getStyle(this.props.theme)}>
        <div className="widget-setting-layerlist">
          <SettingSection
            title={this.getTranslatedString('sourceLabel')}
            role="group"
            aria-label={this.getTranslatedString('sourceLabel')}
          >
            <SettingRow>
              <div className="layerlist-tools w-100">
                <div className="w-100">
                  <div className="layerlist-tools-item radio">
                    <Radio
                      id="map-data"
                      style={{ cursor: 'pointer' }}
                      name="source-option"
                      onChange={(e) => { this.onMapModeChange(false) }}
                      checked={!this.state.useMapWidget}
                    />
                    <Label
                      style={{ cursor: 'pointer' }}
                      for="map-data"
                      className="ml-1"
                    >
                      {this.getTranslatedString('showLayerForMap')}
                    </Label>
                  </div>
                </div>
                <div className="w-100">
                  <div className="layerlist-tools-item radio">
                    <Radio
                      id="map-view"
                      style={{ cursor: 'pointer' }}
                      name="source-option"
                      onChange={(e) => { this.onMapModeChange(true) }}
                      checked={this.state.useMapWidget}
                    />
                    <Label
                      style={{ cursor: 'pointer' }}
                      for="map-view"
                      className="ml-1"
                    >
                      {this.getTranslatedString('interactWithMap')}
                    </Label>
                  </div>
                </div>
              </div>
            </SettingRow>
            {setDataContent}
          </SettingSection>

          <SettingSection
            title={this.getTranslatedString('options')}
            role="group"
            aria-label={this.getTranslatedString('options')}
          >
            {actionsContent}
            {optionsContent}
          </SettingSection>

          {this.state.useMapWidget &&
            <SettingSection
              title={this.getTranslatedString('enhancedOptionsLabel')}
              role="group"
              aria-label={this.getTranslatedString('enhancedOptionsLabel')}
            >
              <SettingRow flow='wrap'>
                <Label className='enhanced-options-desc'>{this.getTranslatedString('enhancedOptionsDesc')}</Label>
              </SettingRow>
              {this.getEnhancedOptionsContent()}
            </SettingSection>
          }

          <SettingSection
            title={this.getTranslatedString('importExportLabel')}
            role="group"
            aria-label={this.getTranslatedString('importExportLabel')}
          >
            <SettingRow flow='wrap'>
              <Label className='enhanced-options-desc'>{this.getTranslatedString('importExportDesc')}</Label>
            </SettingRow>
            <SettingRow>
              <Button type='primary' size='sm' onClick={this.exportSettingsXml}>
                {this.getTranslatedString('exportSettings')}
              </Button>
              <Button
                type='default'
                size='sm'
                className='ml-2'
                onClick={() => { this.importFileRef.current && this.importFileRef.current.click() }}
              >
                {this.getTranslatedString('importSettings')}
              </Button>
              <input
                ref={this.importFileRef}
                type='file'
                accept='.xml,text/xml,application/xml'
                style={{ display: 'none' }}
                onChange={this.onImportFileChosen}
              />
            </SettingRow>
            {this.state.importStatus &&
              <SettingRow>
                <Alert
                  type={this.state.importStatus.kind === 'success' ? 'success' : 'error'}
                  text={this.state.importStatus.message}
                  withIcon
                  closable
                  onClose={() => { this.setState({ importStatus: null }) }}
                />
              </SettingRow>
            }
          </SettingSection>
          <SettingSection title={__t("help")}>
            <SettingRow tag='label' label={__t("showHelpGuide")}>
              <Switch
                checked={this.props.config?.showHelp !== false}
                onChange={(evt) => { this.props.onSettingChange({ id: this.props.id, config: (this.props.config as any).set('showHelp', evt.target.checked) }) }}
                aria-label={__t("showTheQuestionMarkButtonThat")}
              />
            </SettingRow>
          </SettingSection>
        </div>
      </div>
    )
  }
}
