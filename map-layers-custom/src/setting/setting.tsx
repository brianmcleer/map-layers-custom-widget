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
import { Switch, Radio, Label, Alert, Checkbox, TextInput, Button, defaultMessages as jimuDefaultMessages } from 'jimu-ui'
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
import { createRef } from 'react'

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
}

export type WidgetSettingProps = AllWidgetSettingProps<IMConfig> & ExtraProps

export default class Setting extends React.PureComponent<
AllWidgetSettingProps<IMConfig> & ExtraProps,
WidgetSettingState
> {
  supportedDsTypes = Immutable([
    AllDataSourceTypes.WebMap,
    AllDataSourceTypes.WebScene
  ])

  customizeLayersTrigger = createRef<HTMLDivElement>()
  // Hidden file input used by the "Import settings" button.
  importFileRef = createRef<HTMLInputElement>()

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
    'toolSpotlight', 'toolMove', 'symbolOption'
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
      importStatus: null
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

    this.props.onSettingChange(setting)

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

    const PARENT_TYPES = new Set([
      'esri.layers.GroupLayer',
      'esri.layers.MapImageLayer',
      'esri.layers.TileLayer',
      'esri.layers.CatalogLayer'
    ])

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
        if (PARENT_TYPES.has(layer.declaredClass)) {
          try {
            const jlvId = jmv.getJimuLayerViewIdByAPILayer(layer)
            if (jlvId && !seen.has(jlvId)) {
              seen.add(jlvId)
              result.push({ jlvId, title: layer.title || layer.id || jlvId })
            }
          } catch (e) { /* ignore unresolved */ }
          // Recurse into nested children
          if (layer.layers) await visit(layer.layers)
          else if (layer.sublayers) await visit(layer.sublayers)
        }
      }
    }

    await visit(jmv.view.map.layers)

    if (this.state.activeCustomizeJmvId === jmvId) {
      this.setState({ groupLayerInfos: result, groupLayerInfosLoaded: true })
    }
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

  getEnhancedOptionsContent = () => {
    const collapsibleOn = !!(this.props.config && this.props.config.collapsibleList)
    const searchOn = !!(this.props.config && this.props.config.searchLayers)
    const extraToolsOn = !!(this.props.config && this.props.config.extraLayerTools)
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
        {this.getSwitchOption('extraLayerTools')}
        {extraToolsOn &&
          <React.Fragment>
            {this.getToolSwitch('toolFlash', 'flashLayer')}
            {this.getToolSwitch('toolCopyUrl', 'copyUrl')}
            {this.getToolSwitch('toolRefresh', 'refreshLayer')}
            {this.getToolSwitch('toolDetails', 'layerDetails')}
            {this.getToolSwitch('toolSpotlight', 'spotlight')}
            {this.getToolSwitch('toolMove', 'moveLayer')}
          </React.Fragment>
        }
        {this.getSwitchOption('enableAddLayer')}
        {this.getSwitchOption('enableMasterOpacity')}
        {this.getSwitchOption('enableBasemapSwitcher')}
        {this.getSwitchOption('enableLegendPanel')}
        {this.getSwitchOption('showLayerCount')}
        {this.getSwitchOption('enableLayerViews')}
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
    if (Object.keys(mapViews).length === 1 && !Object.values(mapViews)?.[0]?.dataSourceId) {
      return true
    } else {
      return false
    }
  }

  render () {
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
        </div>
      </div>
    )
  }
}
