/** @jsx jsx */
import { AppMode, React, jsx, type AllWidgetProps, DataSourceComponent, MutableStoreManager, isKeyboardMode, focusElementInKeyboardMode, type MapDataSource, DataSourceTypes, type IMState, ExBAddedJSAPIProperties, semver, getAppStore, appActions, type ImmutableObject, type ResourceSessions } from 'jimu-core'
import {
    loadArcGISJSAPIModules,
    JimuMapViewComponent,
    type JimuMapView,
    MapViewManager,
    type JimuLayerView
} from 'jimu-arcgis'
import { WidgetPlaceholder, Popper, defaultMessages as jimuDefaultMessages, Loading, getFocusableElements, LoadingType, Paper } from 'jimu-ui'
import type { IMConfig } from '../config'
import { getStyle } from './lib/style'
import type Action from './actions/action'
import defaultMessages from './translations/default'
import layerListIcon from '../../icon.svg'
import { versionManager } from '../version-manager'
import MapLayersActionList from './components/map-layers-action-list'
import { TableOutlined } from 'jimu-icons/outlined/data/table'
import { getLayerListActions } from './actions'
import { restoreSpotlight } from './actions/spotlight'
import MapLayersHeader from './components/map-layers-header'
import { ACTION_INDEXES } from './actions/constants'
import HelpPopup from './components/HelpPopup'
import FirstRunHint from './components/FirstRunHint'
import { buildHelpSections } from './helpSections'
import type { HelpFeatures } from './helpSections'
import { beacon } from '../shared/beacon'
import type { BeaconHandle } from '../shared/beacon'
import { readShareIds, applyShareIds } from './lib/share-link'
import { cleanTitle, decorateTitle } from './lib/display-title'
import { loadMemory, machineTranslate, translateName, memoryLocale, DEFAULT_MEMORY_URL } from './lib/layer-name-i18n'
import { isFavorite, subscribeFavorites } from './lib/favorites'
import { __setIntl } from './i18n-t'

const allDefaultMessages = Object.assign({}, defaultMessages, jimuDefaultMessages)

export enum LoadStatus {
    Pending = 'Pending',
    Fulfilled = 'Fulfilled',
    Rejected = 'Rejected',
}

export interface WidgetProps extends AllWidgetProps<IMConfig> {
    // Experience Builder injects these at runtime, but the EB 1.21 editor
    // declarations do not consistently expose them under pnpm/Visual Studio.
    // useDataSources and useMapWidgetIds are typed loosely on purpose: the
    // widget reads them with plain indexing, and the real props are immutable
    // arrays whose element access works the same way.
    id: string
    originVersion?: string
    useDataSources?: any
    useMapWidgetIds?: any
    enableDataAction?: boolean
}

export interface WidgetState {
    mapWidgetId: string
    jimuMapViewId: string
    mapDataSourceId: string
    listLoadStatus: LoadStatus
    tableLoadStatus: LoadStatus
    isActionListPopperOpen: boolean
    actionListDOM: React.ReactNode
    nativeActionPopper: React.JSX.Element
    oldConfigUpdated: boolean
    headerKey: string
    // Whether the collapsible layer list body is currently collapsed down to
    // just the header bar (only relevant when config.collapsibleList is on).
    isListCollapsed: boolean
    // Name of the layer currently spotlighted/isolated, or null. Drives the
    // focus overlay (dimmed backdrop + exit card) shown over the layer panel.
    spotlightLayerName: string
    // True briefly while exiting focus: keeps the overlay up (hiding the tree
    // reflow) and swaps the card to a "restoring" state until the tree settles.
    spotlightExiting?: boolean
    // In-widget help guide (shared pattern, see WIDGETHANDOFF Section 10).
    helpOpen: boolean
    showFirstRunHint: boolean
}

interface ExtraProps {
    isDesignMode: boolean
    resourceSessions: ImmutableObject<ResourceSessions>
}

export class Widget extends React.PureComponent<WidgetProps & ExtraProps, WidgetState> {
    // Type-only declarations for Visual Studio under the EB 1.21 pnpm layout.
    // They restore the React instance members when VS fails to follow React's
    // inherited type declarations. `declare` fields emit no JavaScript.
    declare readonly props: Readonly<WidgetProps & ExtraProps>
    declare state: Readonly<WidgetState>
    declare setState: (
        state: Partial<WidgetState> | ((previousState: Readonly<WidgetState>, props: Readonly<WidgetProps & ExtraProps>) => Partial<WidgetState> | null),
        callback?: () => void
    ) => void

    public beacon: BeaconHandle | null = null
    // The ?mlc= layer ids are applied once per widget life, the first time the list is ready.
    private _shareApplied = false
    // Layer on/off telemetry is buffered so a batch action becomes one row, not fifty.
    private _layerEvents: Array<{ on: boolean, title: string }> = []
    private _layerEventTimer: ReturnType<typeof setTimeout> | null = null
    // True while the widget itself is switching layers (share link on load), so those
    // changes are not counted as user clicks.
    private _suppressLayerTelemetry = false
    // Layer telemetry watches the map itself (every layer and sublayer at any depth), not the
    // list items, so groups inside groups, map-image sublayers and layers added later all count.
    private _layerTelHandles: any[] = []
    private _layerTelWatched: WeakSet<any> = new WeakSet()
    private _autoParentOn: WeakSet<any> = new WeakSet()
    // Broken layers already reported this page load (by path), so each is one row.
    private _brokenReported: Set<string> = new Set()
    // Layer status heartbeat for City Map Beacon (layers-status rows).
    private _statusTimer: ReturnType<typeof setTimeout> | null = null
    private _lastStatus = ''
    private _lastStatusAt = 0
    // Layer health: service url -> false while it is not answering. Timer for the next check.
    private _serviceDown: Map<string, boolean> = new Map<string, boolean>()
    private _healthTimer: ReturnType<typeof setTimeout> | null = null
    private _healthRunning = false
    private _esriRequest: any = null
    private _unsubscribeFavorites: (() => void) | null = null
    // Layer names in the app language: the locale they were loaded for, the shared memory for it,
    // and a counter so a slow load for an old locale never overwrites a newer one.
    private _nameLocale = ''
    private _nameKey = ''
    private _nameMemory: Map<string, string> | null = null
    private _nameSeq = 0
    // Set in componentWillUnmount. Async list builds check it after every await so a widget that
    // closed mid-load (panel closed, page switched) never touches a detached container.
    private _unmounted = false
    // Debounce handle for the deferred list refresh scheduled in componentDidUpdate.
    private _refreshTimer: ReturnType<typeof setTimeout> | null = null

    public viewFromMapWidget: any | any
    // This is used by the popup action
    public jmvFromMap: JimuMapView
    private dataSource: MapDataSource
    private mapView: any
    private sceneView: any
    private MapView: any
    private SceneView: any
    private LayerList: any
    private TableList: any
    private readonly layerListActions: Action[]
    private renderPromise: Promise<void>
    private currentUseMapWidgetId: string
    private currentUseDataSourceId: string
    private jimuMapView: JimuMapView

    static mapExtraStateProps = (state: IMState, props: AllWidgetProps<IMConfig>): ExtraProps => {
        return {
            isDesignMode: state.appRuntimeInfo.appMode === AppMode.Design,
            resourceSessions: state.resourceSessions
        }
    }

    static versionManager = versionManager

    mapContainerRef: React.RefObject<HTMLDivElement>
    layerListContainerRef: React.RefObject<HTMLDivElement>
    tableListContainerRef: React.RefObject<HTMLDivElement>
    optionBtnRef: React.MutableRefObject<HTMLElement | null>
    layerListRef: React.MutableRefObject<any | null>
    tableListRef: React.MutableRefObject<any | null>
    oldSublayersSetMap: Map<string, Set<string>>
    // Layer ids the user explicitly moved out of / between groups. These must
    // stay visible in the list even if the whitelist/auto-include filter would
    // otherwise hide them once they leave their original group.
    _promotedLayerIds: Set<string> = new Set<string>()
    _reparentHandle: any = null
    // True while Layer focus is restoring; suppresses the visibility watcher's
    // open/collapse coupling so the tree's expand state can be restored cleanly.
    _spotlightAdjusting: boolean = false
    // Layer focus (isolate) working state, assigned by the spotlight actions.
    _spotlightVisBackup: Map<any, boolean> = null
    _spotlightOpenBackup: Map<any, boolean> = null
    _spotlightLayerId: string = null
    // Group layers this widget switched into pick-one (exclusive) mode, with
    // the visibilityMode each had before, so a config change or unmount can
    // put the map back the way the web map author left it.
    _pickOneOriginalModes: Map<any, string> = new Map<any, string>()

    constructor(props) {
        super(props)
        this.state = {
            mapWidgetId: null,
            mapDataSourceId: null,
            jimuMapViewId: null,
            listLoadStatus: LoadStatus.Pending,
            isActionListPopperOpen: false,
            actionListDOM: null,
            tableLoadStatus: LoadStatus.Pending,
            nativeActionPopper: null,
            oldConfigUpdated: false,
            headerKey: null,
            isListCollapsed: props.config?.collapsibleList ? (props.config?.startCollapsed ?? false) : false,
            spotlightLayerName: null,
            spotlightExiting: false,
            helpOpen: false,
            showFirstRunHint: false
        }
        this.renderPromise = Promise.resolve()
        this.layerListActions = getLayerListActions(this)
        this.mapContainerRef = React.createRef()
        this.layerListContainerRef = React.createRef()
        this.tableListContainerRef = React.createRef()
        this.optionBtnRef = React.createRef()
        this.layerListRef = React.createRef()
        this.tableListRef = React.createRef()
        this.oldSublayersSetMap = new Map()
    }

    public translate = (stringId: string) => {
        return this.props.intl.formatMessage({
            id: stringId,
            defaultMessage: allDefaultMessages[stringId]
        })
    }

    componentWillUnmount() {
        this._unmounted = true
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer)
            this._refreshTimer = null
        }
        this.stopLayerHealth()
        this.stopLayerStatus()
        this.teardownLayerTelemetry()
        if (this._unsubscribeFavorites) { this._unsubscribeFavorites(); this._unsubscribeFavorites = null }
        if (this._layerEventTimer) {
            clearTimeout(this._layerEventTimer)
            this._layerEventTimer = null
            this.flushLayerEvents()
        }
        if (this.jmvFromMap) {
            try { this.jmvFromMap.removeJimuLayerViewCreatedListener(this._addJlvCreatedListener) } catch (_) { /* view already gone */ }
        }
        if (this._reparentHandle && typeof this._reparentHandle.remove === 'function') {
            try { this._reparentHandle.remove() } catch (_) { /* noop */ }
            this._reparentHandle = null
        }
        this.restorePickOneGroups(new Set<string>())
        this.destroyLayerList()
        this.destroyTableList()
    }

    componentDidMount() {
        this._unmounted = false
        this.beacon = beacon.init(this.props)
        this.bindClickHandler()
        // A star toggled from the layer menu updates the list titles and the favorites filter.
        this._unsubscribeFavorites = subscribeFavorites((widgetId: string) => {
            if (widgetId === this.props.id) this.refreshAllTitles()
        })
        // First-run hint shows until the user dismisses it once (or opens the guide)
        if (!this.readHintDismissed()) this.setState({ showFirstRunHint: true })
        this.syncNameLanguage()
    }

    // ==================== In-widget help guide (shared pattern, see WIDGETHANDOFF Section 10) ====================

    /** Translate helper for the guide. Uses the widget's intl so the help strings localize with the rest of the UI. */
    private readonly t = (id: string, values?: Record<string, string>): string => {
        return this.props.intl.formatMessage({ id, defaultMessage: allDefaultMessages[id] }, values)
    }

    /** Storage key for the first-run hint dismissal, namespaced by widget id so two copies in one app do not share it. */
    private get firstRunHintKey(): string {
        return `mapLayersCustom.helpHintDismissed.${this.props.id}`
    }

    private readHintDismissed(): boolean {
        try {
            return typeof window !== 'undefined' && !!window.localStorage && window.localStorage.getItem(this.firstRunHintKey) === '1'
        } catch (_) {
            // Private browsing can throw on read; the guide is not worth breaking the widget over.
            return false
        }
    }

    private readonly dismissFirstRunHint = (): void => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem(this.firstRunHintKey, '1')
        } catch (_) { /* private browsing */ }
        this.setState({ showFirstRunHint: false })
    }

    /** Opening the guide counts as answering the hint, so it dismisses the hint too. */
    private readonly openHelp = (): void => {
        if (this.state.showFirstRunHint) this.dismissFirstRunHint()
        this.setState({ helpOpen: true })
    }

    private readonly closeHelp = (): void => {
        this.setState({ helpOpen: false })
    }

    /**
     * Feature flags for the guide, computed with the same checks the list, the header and the
     * layer actions use, so the guide never describes a control that is not on screen.
     * Header controls and most layer actions exist only in map-widget mode (see the header's
     * isMapWidgetMode gating and each action's isValid).
     */
    private helpFeatures(): HelpFeatures {
        const config: any = this.props.config || {}
        const mapMode = !!config.useMapWidget
        const extra = !!config.extraLayerTools
        const tr = this.translate
        return {
            mapMode,
            tickBoxes: !!config.useTickBoxes,
            autoShowParents: config.autoShowParentLayers !== false,
            reorder: !!config.reorderLayers,
            layerLegend: mapMode && !!config.enableLegend,
            tables: !!config.showTables,
            search: !!config.searchLayers,
            batch: !!config.layerBatchOptions,
            layerCount: !!config.showLayerCount,
            collapsible: !!config.collapsibleList,
            savedViews: mapMode && !!config.enableLayerViews,
            presetViews: mapMode && this.currentPresets().length > 0,
            addLayer: mapMode && !!config.enableAddLayer,
            masterOpacity: mapMode && !!config.enableMasterOpacity,
            basemapSwitcher: mapMode && !!config.enableBasemapSwitcher,
            legendPanel: mapMode && !!config.enableLegendPanel,
            goto: mapMode && !!config.goto,
            labels: mapMode && !!config.label,
            popup: !!config.popup,
            transparency: !!config.opacity,
            visibilityRange: !!config.visibilityRange,
            information: !!config.information,
            changeSymbol: !!config.changeSymbolForRuntimeLayers,
            solo: mapMode && !!config.soloLayer,
            pickOne: mapMode && this.pickOneGroupIdSet().size > 0,
            shareLink: mapMode && !!config.layerBatchOptions && !!config.enableShareLink,
            searchDeep: !!config.searchLayers && !!config.searchLayerDescriptions,
            layerCsv: mapMode && !!config.layerBatchOptions && !!config.enableLayerCsv,
            layerHealth: mapMode && !!config.enableLayerHealth,
            favorites: mapMode && !!config.enableFavorites,
            imagery: mapMode && !!config.enableAddLayer && !!config.enableImageryIndex,
            zoomToScale: mapMode && extra && config.toolZoomToScale !== false,
            flash: mapMode && extra && config.toolFlash !== false,
            copyUrl: extra && config.toolCopyUrl !== false,
            refresh: extra && config.toolRefresh !== false,
            details: extra && config.toolDetails !== false,
            spotlight: mapMode && extra && config.toolSpotlight !== false,
            move: mapMode && extra && config.toolMove !== false,
            labelsText: {
                tables: tr('tables'),
                batchOptions: tr('batchOptions'),
                turnOnAllLayers: tr('turnOnAllLayers'),
                turnOffAllLayers: tr('turnOffAllLayers'),
                resetVisibility: tr('resetVisibility'),
                zoomToVisible: tr('zoomToVisible'),
                exportMapImage: tr('exportMapImage'),
                showVisibleOnly: tr('showVisibleOnly'),
                showAllLayers: tr('showAllLayers'),
                expandAllLayers: tr('expandAllLayers'),
                collapseAllLayers: tr('collapseAllLayers'),
                savedViews: tr('savedViews'),
                presetViews: tr('presetViews'),
                saveCurrentView: tr('saveCurrentView'),
                save: tr('save'),
                exportViews: tr('exportViews'),
                importViews: tr('importViews'),
                addLayer: tr('addLayer'),
                addLayerTitle: tr('addLayerTitle'),
                addLayerSubmit: tr('addLayerSubmit'),
                addLayerError: tr('addLayerError'),
                masterOpacity: tr('masterOpacity'),
                basemap: tr('basemap'),
                legend: tr('legend'),
                goto: tr('goto'),
                showLabels: tr('showLabels'),
                hideLabels: tr('hideLabels'),
                enablePopup: tr('enablePopup'),
                disablePopup: tr('disablePopup'),
                transparency: tr('transparency'),
                visibilityRange: tr('visibilityRange'),
                information: tr('information'),
                changeSymbol: tr('changeSymbol'),
                soloLayer: tr('soloLayer'),
                flashLayer: tr('flashLayer'),
                copyUrl: tr('copyUrl'),
                refreshLayer: tr('refreshLayer'),
                layerDetails: tr('layerDetails'),
                spotlight: tr('spotlight'),
                clearSpotlight: tr('clearSpotlight'),
                moveToTop: tr('moveToTop'),
                moveToBottom: tr('moveToBottom'),
                moveOutOfGroup: tr('moveOutOfGroup'),
                remove: tr('remove'),
                copyLayerLink: tr('copyLayerLink'),
                exportLayerCsv: tr('exportLayerCsv'),
                layerUnavailable: tr('layerUnavailable'),
                favoriteAdd: tr('favoriteAdd'),
                favoriteRemove: tr('favoriteRemove'),
                showFavoritesOnly: tr('showFavoritesOnly'),
                imageryTab: tr('imageryTab'),
                zoomToScale: tr('zoomToScale')
            }
        }
    }

    componentDidUpdate(prevProps: WidgetProps & ExtraProps, prevState: WidgetState) {
        // Layer names follow the app language (and the name settings) without a reload.
        this.syncNameLanguage()
        if (this.props.isDesignMode && this.props.isDesignMode !== prevProps.isDesignMode) {
            // Clean up the native popper when switch to the design mode
            this.setState({ nativeActionPopper: null })
        }

        if (this.needToPreventRefreshList(prevProps, prevState)) {
            return
        }

        // Clean up the data action list before rerendering the layerlist
        this.setState({
            actionListDOM: null
        })

        // Close the popper when dataAction toggled OR config changed
        // This could keep the action list's state to the latest
        if (this.props.enableDataAction !== prevProps.enableDataAction || this.props.config !== prevProps.config) {
            this.optionBtnRef.current = null
            this.setState({ isActionListPopperOpen: false })
        }

        this.bindClickHandler()

        if (this.props.config?.showTables !== prevProps.config?.showTables) {
            this.renderTableList()
            // Do not refresh the layerlist if it's caused by the showTables
            return
        }

        if ((this.props.config.useMapWidget && this.state.mapWidgetId === this.currentUseMapWidgetId) ||
            (!this.props.config.useMapWidget && this.state.mapDataSourceId === this.currentUseDataSourceId)) {
            // Put the layerlist render into the next marco task, so it will not slow down the setting panel UI.
            // Debounced: a burst of updates schedules one refresh, and unmount cancels it.
            if (this._refreshTimer) clearTimeout(this._refreshTimer)
            this._refreshTimer = setTimeout(() => {
                this._refreshTimer = null
                if (this._unmounted) return
                this.syncRenderer(this.renderPromise)
            }, 150)
        }
        if (!this.props.config.popup && prevProps.config.popup) {
            this.restoreLayerPopupField()
        }
    }

    restoreLayerPopupField() {
        const popupValue = MutableStoreManager.getInstance().getStateValue([this.props.widgetId, 'popup']) || {}
        for (const entry of Object.values(popupValue)) {
            (entry as any).layer.popupEnabled = (entry as any).initialValue
        }
        if (popupValue) {
            MutableStoreManager.getInstance().updateStateValue(this.props.widgetId, 'popup', null)
        }
    }

    bindClickHandler() {
        const bindHelper = (refNode: HTMLElement) => {
            if (refNode && !refNode.onclick) {
                refNode.onclick = (e) => {
                    const target = e.target as HTMLElement
                    // Only manipulate the fake action
                    if (target.nodeName === 'CALCITE-ACTION' && target.title === this.translate('options')) {
                        if (this.optionBtnRef.current !== target) {
                            this.optionBtnRef.current = target
                            // The popper here is kept mounted, this results in re-render the popper's content
                            // instead of creating a new popper component, which causes overlap problem.
                            // Give the popper a random key so it will force the popper to re-calculate the position again.
                            this.setState({ isActionListPopperOpen: true, nativeActionPopper: null })
                        } else {
                            this.setState({ isActionListPopperOpen: !this.state.isActionListPopperOpen, nativeActionPopper: null })
                        }
                    }
                }
            }
        }

        bindHelper(this.layerListContainerRef.current)
        bindHelper(this.tableListContainerRef.current)
    }

    needToPreventRefreshList(prevProps: WidgetProps & ExtraProps, prevState: WidgetState) {
        if (prevState.isActionListPopperOpen !== this.state.isActionListPopperOpen || prevState.nativeActionPopper !== this.state.nativeActionPopper || prevState.listLoadStatus !== this.state.listLoadStatus || prevState.tableLoadStatus !== this.state.tableLoadStatus || prevState.headerKey !== this.state.headerKey || prevState.isListCollapsed !== this.state.isListCollapsed) {
            return true
        }
        // Opening or closing the help guide, or dismissing its hint, never refreshes the layer list
        if (prevState.helpOpen !== this.state.helpOpen || prevState.showFirstRunHint !== this.state.showFirstRunHint) {
            return true
        }
        if (prevState.actionListDOM !== this.state.actionListDOM) {
            return true
        }
        if (prevState.tableLoadStatus !== this.state.tableLoadStatus) {
            return true
        }
        // Sometimes clicking the option will fetch the layer's info, which causes portalSelf changes
        if (this.props.isDesignMode !== prevProps.isDesignMode || this.props.portalSelf !== prevProps.portalSelf) {
            return true
        }
        return false
    }

    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    async createView(): Promise<any | any | unknown> {
        if (this.props.config.useMapWidget) {
            return this.jimuMapView?.view
        } else {
            return await this.createViewByDataSource()
        }
    }

    async createViewByDataSource() {
        await this.loadViewModules(this.dataSource)

        if (this.dataSource.type === DataSourceTypes.WebMap) {
            return await new Promise((resolve, reject) => { this.createWebMapView(this.MapView, resolve, reject) })
        } else if (this.dataSource.type === DataSourceTypes.WebScene) {
            return new Promise((resolve, reject) => { this.createSceneView(this.SceneView, resolve, reject) })
        } else {
            return Promise.reject(new Error(null))
        }
    }

    createWebMapView(MapView, resolve, reject) {
        if (this.mapView) {
            this.mapView.map = this.dataSource.map
        } else {
            const mapViewOption: any = {
                map: this.dataSource.map,
                container: this.mapContainerRef.current
            }
            this.mapView = new MapView(mapViewOption)
        }
        this.mapView.when(
            () => {
                resolve(this.mapView)
            },
            (error) => reject(error)
        )
    }

    createSceneView(SceneView, resolve, reject) {
        if (this.sceneView) {
            this.sceneView.map = this.dataSource.map
        } else {
            const mapViewOption: any = {
                map: this.dataSource.map,
                container: this.mapContainerRef.current
            }
            this.sceneView = new SceneView(mapViewOption)
        }

        this.sceneView.when(
            () => {
                resolve(this.sceneView)
            },
            (error) => reject(error)
        )
    }

    destroyView() {
        this.mapView && !this.mapView.destroyed && this.mapView.destroy()
        this.sceneView && !this.sceneView.destroyed && this.sceneView.destroy()
    }

    async getModule(moduleName: string, getter: any, setter: any) {
        const currentValue = getter()
        if (currentValue) {
            return currentValue
        }
        const module = await loadArcGISJSAPIModules([moduleName])
        setter(module[0])
        return module[0]
    }

    async loadViewModules(dataSource: MapDataSource): Promise<any | any> {
        let ret = null
        if (dataSource.type === DataSourceTypes.WebMap) {
            ret = await this.getModule('esri/views/MapView', () => this.MapView, (value) => { this.MapView = value })
        } else if (dataSource.type === DataSourceTypes.WebScene) {
            ret = await this.getModule('esri/views/SceneView', () => this.SceneView, (value) => { this.SceneView = value })
        }
        return ret
    }

    destroyTableList() {
        this.tableListRef.current && !this.tableListRef.current.destroyed && this.tableListRef.current.destroy()
    }

    destroyLayerList() {
        this.layerListRef.current && !this.layerListRef.current.destroyed && this.layerListRef.current.destroy()
    }

    async createTableList(view: any | any) {
        this.setState({ tableLoadStatus: LoadStatus.Pending })
        await this.getModule('esri/widgets/TableList', () => this.TableList, (value) => { this.TableList = value })

        // The host div is gone if the widget unmounted or showTables flipped off while the module loaded
        const host = this.tableListContainerRef.current
        if (this._unmounted || !host) return null

        const container = document && document.createElement('div')
        container.className = 'table-list'
        host.appendChild(container)

        this.destroyTableList()

        this.tableListRef.current = new this.TableList({
            container: container,
            map: view.map,
            dragEnabled: this.props.config?.reorderLayers,
            listItemCreatedFunction: this.defineLayerListActionsGenerator(true)
        })

        this.tableListRef.current.on('trigger-action', (event) => {
            this.onLayerListActionsTriggered(event, true)
        })

        return this.tableListRef.current
    }

    async createLayerList(view: any | any) {
        this.setState({ listLoadStatus: LoadStatus.Pending })
        if (!this.LayerList) {
            const modules = await loadArcGISJSAPIModules([
                'esri/widgets/LayerList'
            ])
            this.LayerList = modules[0]
        }

        // The host div is gone if the widget unmounted (panel closed, page switched) or fell back to the
        // placeholder while the LayerList module or the view loaded. Bail quietly: nothing to render into.
        const host = this.layerListContainerRef.current
        if (this._unmounted || !host) return null

        const container = document && document.createElement('div')
        container.className = 'jimu-widget'
        host.appendChild(container)

        this.destroyLayerList()

        let option: any = {
            view: view,
            listItemCreatedFunction: this.defineLayerListActionsGenerator(false),
            container: container
        }
        if (this.props.config.useMapWidget) {
            option = {
                ...option,
                dragEnabled: this.props.config?.reorderLayers ?? false,
                visibilityAppearance: this.props.config?.useTickBoxes ? 'checkbox' : 'default',
            }
        }

        const layerList = new this.LayerList(option)

        layerList.on('trigger-action', (event) => {
            this.onLayerListActionsTriggered(event)
        })

        layerList.when(() => {
            if (this.props.config.expandAllLayers) {
                this.toggleExpand(layerList.operationalItems, true)
            }

            // Set up visibility watchers after the layer list is ready
            this.setLayerVisibilityWatchers(layerList);

            // The widget's own load-time changes (pick-one trim, share link) are not user
            // clicks: keep the layer telemetry quiet until the SDK has fired their watchers.
            this._suppressLayerTelemetry = true

            // Pick-one groups: switch the configured groups into exclusive
            // visibility (radio buttons) and release any no longer configured.
            this.applyPickOneGroups();

            // Layer state from the page address (?mlc=), once per widget life.
            this.applyShareLinkOnce();

            setTimeout(() => { this._suppressLayerTelemetry = false }, 800)

            // Service health: first check shortly after load, then on the configured timer.
            this.startLayerHealth();
            // Status heartbeat for the dashboard (after the first health check has had time to run).
            this.startLayerStatus();

            // Keep any layer that gets moved OUT to the top level (via drag or
            // the Move-out menu) visible, even though it no longer matches the
            // group-based whitelist.
            this.setupReparentPromotion(layerList);
        })

        this.layerListRef.current = layerList
        return layerList
    }

    // Builder-authored presets for the active map view (plain arrays for the header).
    currentPresets(): Array<{ id: string, name: string, layerIds: string[] }> {
        const raw: any = this.props.config?.presetViews?.[this.state.jimuMapViewId]
        if (!raw) return []
        const arr: any[] = raw.asMutable ? raw.asMutable({ deep: true }) : Array.from(raw)
        return arr.filter((p: any) => p && p.name).map((p: any) => ({ id: String(p.id), name: String(p.name), layerIds: Array.from(p.layerIds || []) as string[] }))
    }

    // ==================== Layer state in the URL (?mlc=) ====================

    // Reads the ?mlc= parameter the first time the list is ready and switches the map's
    // layers to match. Layers the map does not have are ignored. Runs once per widget life so
    // a later list rebuild (config change, runtime layer added) does not undo the user's clicks.
    applyShareLinkOnce() {
        if (this._shareApplied) return
        const config: any = this.props.config || {}
        if (!config.useMapWidget || !config.layerBatchOptions || !config.enableShareLink) return
        this._shareApplied = true
        let ids: string[] | null = null
        try { ids = readShareIds(typeof window !== 'undefined' ? window.location.search : '') } catch (e) { ids = null }
        if (!ids) return
        const view = this.viewFromMapWidget || this.jmvFromMap?.view
        const allLayers = view?.map?.allLayers
        if (!allLayers) return
        try {
            const found = applyShareIds(allLayers, ids)
            // Groups holding a linked layer must be on for it to draw.
            if (config.autoShowParentLayers !== false) {
                allLayers.forEach((layer: any) => {
                    if (layer && layer.visible === true && layer.declaredClass !== 'esri.layers.GroupLayer') this.ensureAncestorsVisible(layer)
                })
            }
            this.beacon?.action('open-share-link', `${found} of ${ids.length}`)
        } catch (e) {
            this.beacon?.error(e, 'open-share-link')
        }
    }

    // ==================== Layer on/off telemetry ====================

    // Watches visibility on every operational layer at every depth: map.allLayers (flattened
    // across group layers) plus each layer's sublayers, walked recursively (map image, tile,
    // WMS, KML). New layers and sublayers are picked up as they arrive. Each row carries the
    // path, for example "Utilities > Water > Water Mains", so two "Mains" layers stay apart.
    setupLayerTelemetry(view: any) {
        this.teardownLayerTelemetry()
        const map = view && view.map
        if (!map || !map.allLayers) return
        const keep = (h: any) => { if (h) this._layerTelHandles.push(h) }
        const watchSublayers = (coll: any) => {
            if (!coll || typeof coll.forEach !== 'function') return
            coll.forEach((sub: any) => watchOne(sub))
            if (typeof coll.on === 'function') keep(coll.on('change', (e: any) => { (e.added || []).forEach((sub: any) => watchOne(sub)) }))
        }
        const watchOne = (lyr: any) => {
            if (!lyr || typeof lyr.watch !== 'function' || this._layerTelWatched.has(lyr)) return
            if (this.telemetrySkips(lyr)) return
            this._layerTelWatched.add(lyr)
            // Broken layers: a layer whose load fails (bad URL, 403, 404, deleted item, token).
            if (lyr.declaredClass !== 'esri.layers.support.Sublayer') {
                if (lyr.loadStatus === 'failed') this.reportBrokenLayer(lyr, lyr.loadError, 'load')
                else keep(lyr.watch('loadStatus', (st: string) => { if (st === 'failed') this.reportBrokenLayer(lyr, lyr.loadError, 'load') }))
            }
            keep(lyr.watch('visible', (v: boolean) => {
                if (v && this._autoParentOn.has(lyr)) { this._autoParentOn.delete(lyr); return }
                this.recordLayerEvent(!!v, this.layerPath(lyr))
            }))
            // Sublayers exist once the service description has loaded; watch for both.
            if (lyr.sublayers) watchSublayers(lyr.sublayers)
            else if (typeof lyr.when === 'function' && lyr.declaredClass !== 'esri.layers.support.Sublayer') {
                lyr.when(() => { if (!this._unmounted && lyr.sublayers) watchSublayers(lyr.sublayers) }).catch(() => { /* failed layers have nothing to watch */ })
            }
            if (lyr.declaredClass === 'esri.layers.support.Sublayer' && typeof lyr.watch === 'function') {
                keep(lyr.watch('sublayers', (coll: any) => watchSublayers(coll)))
            }
        }
        map.allLayers.forEach((l: any) => watchOne(l))
        keep(map.allLayers.on('change', (e: any) => { (e.added || []).forEach((l: any) => watchOne(l)) }))
        // A layer that loads but cannot draw (bad renderer, projection, WebGL, missing field).
        if (typeof view.on === 'function') {
            keep(view.on('layerview-create-error', (e: any) => { if (e && e.layer && !this.telemetrySkips(e.layer)) this.reportBrokenLayer(e.layer, e.error, 'draw') }))
        }
    }

    // One layer-broken row per layer per page load: "Group > Layer | reason". The reason is a
    // short category and HTTP status, never the raw message (which can carry URLs or tokens).
    reportBrokenLayer(lyr: any, err: any, stage: 'load' | 'draw' | 'missing') {
        if (!this.beacon || this.props.config?.reportBrokenLayers === false) return
        const path = this.layerPath(lyr)
        if (!path || this._brokenReported.has(path)) return
        this._brokenReported.add(path)
        this.beacon.action('layer-broken', `${path} | ${this.brokenReason(err, stage)}`)
    }

    brokenReason(err: any, stage: 'load' | 'draw' | 'missing'): string {
        if (stage === 'missing') return 'not in the service any more'
        const d: any = (err && err.details) || {}
        const status = Number(d.httpStatus || (d.error && d.error.code) || (d.raw && d.raw.error && d.raw.error.code) || (d.messageCode && 0) || 0)
        const name = String((err && err.name) || '')
        const pre = stage === 'draw' ? 'could not draw' : 'could not load'
        if (status === 401 || status === 403 || status === 498 || status === 499 || /not-authorized|identity-manager/i.test(name)) return `${pre}: not authorized${status ? ` (HTTP ${status})` : ''}`
        if (status === 404 || /not-found|notfound/i.test(name)) return `${pre}: not found${status ? ' (HTTP 404)' : ''}`
        if (status >= 500) return `${pre}: server error (HTTP ${status})`
        if (/timeout/i.test(name) || /timeout/i.test(String((err && err.message) || ''))) return `${pre}: timed out`
        if (status) return `${pre}: HTTP ${status}`
        if (name) return `${pre}: ${name.replace(/[^\w:.-]/g, '').slice(0, 60)}`
        return pre
    }

    teardownLayerTelemetry() {
        this._layerTelHandles.forEach((h: any) => { try { h.remove() } catch (e) { /* already gone */ } })
        this._layerTelHandles = []
        this._layerTelWatched = new WeakSet()
    }

    // Layers nobody clicks: basemap layers, hidden ones (listMode hide), the draw layer.
    telemetrySkips(lyr: any): boolean {
        if (lyr.listMode === 'hide') return true
        if (typeof lyr.id === 'string' && (lyr.id.startsWith('jimu-draw') || lyr.id === 'DrawGL')) return true
        let p: any = lyr.parent
        for (let i = 0; p && i < 20; i++) {
            if (p.declaredClass === 'esri.Basemap') return true
            if (p.declaredClass === 'esri.Map' || p.declaredClass === 'esri.WebMap') return false
            if (p.listMode === 'hide-children' || p.listMode === 'hide') return false
            p = p.parent
        }
        return false
    }

    // "Group > Subgroup > Layer" from the layer up to the map (groups and parent sublayers).
    layerPath(lyr: any): string {
        const names: string[] = []
        let cur: any = lyr
        for (let i = 0; cur && i < 12; i++) {
            const dc = cur.declaredClass || ''
            if (dc === 'esri.Map' || dc === 'esri.WebMap' || dc === 'esri.Basemap') break
            const t = String(cur.title ?? cur.name ?? cur.id ?? '').trim()
            if (t) names.unshift(t)
            cur = cur.parent
        }
        return names.join(' > ') || String(lyr.title ?? lyr.id ?? '')
    }

    // Buffers layer visibility changes for 600 ms. A handful become one row each
    // (layer-on / layer-off with the title); a burst (batch action, saved view, share
    // link) becomes a single layers-batch row with the counts.
    recordLayerEvent(on: boolean, title: string) {
        if (!this.beacon || this._suppressLayerTelemetry) return
        if (this.props.config?.telemetryLayers === false) return
        this._layerEvents.push({ on, title: String(title ?? '') })
        if (this._layerEventTimer) clearTimeout(this._layerEventTimer)
        this._layerEventTimer = setTimeout(() => { this._layerEventTimer = null; this.flushLayerEvents() }, 600)
    }

    flushLayerEvents() {
        const events = this._layerEvents.splice(0, this._layerEvents.length)
        if (events.length === 0 || !this.beacon) return
        if (events.length > 5) {
            const on = events.filter(e => e.on).length
            this.beacon.action('layers-batch', `${on} on, ${events.length - on} off`)
            return
        }
        for (const e of events) this.beacon.action(e.on ? 'layer-on' : 'layer-off', e.title)
        // Layer clicks go out now, not on the beacon's 10 s batch, so the dashboard's Right now
        // feed shows them within seconds.
        try { beacon.flush() } catch (e) { /* ignore */ }
    }

    // ==================== Layer status heartbeat ====================

    // One layers-status row per open page: once shortly after the list is ready, then on the
    // health check interval (default 5 minutes), only while the page is visible. Detail:
    //   "on 7 | down 0 | broken 1 | Water Mains; Parcels; Zoning; ..."
    // counts first, then the names of the layers drawing now (clipped to fit). It is the
    // positive signal the dashboard needs: "this page is fine" clears an outage or a broken
    // layer at once, and "these layers are on" feeds its Right now tab. An unchanged status is
    // not resent more than once every 15 minutes.
    startLayerStatus() {
        this.stopLayerStatus()
        if (!this.beacon || this.props.config?.telemetryLayers === false) return
        this._statusTimer = setTimeout(() => { this.sendLayerStatus() }, 10000)
    }

    stopLayerStatus() {
        if (this._statusTimer) { clearTimeout(this._statusTimer); this._statusTimer = null }
    }

    sendLayerStatus() {
        this._statusTimer = null
        if (this._unmounted || !this.beacon) return
        const minutes = Math.max(1, Math.min(120, Number(this.props.config?.layerHealthMinutes) || 5))
        const next = () => { if (!this._unmounted) this._statusTimer = setTimeout(() => { this.sendLayerStatus() }, minutes * 60000) }
        try {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { next(); return }
            const view = this.viewFromMapWidget || this.jmvFromMap?.view
            const allLayers = view?.map?.allLayers
            if (!allLayers) { next(); return }
            const on: string[] = []
            const drawing = (l: any): boolean => { let p: any = l; for (let i = 0; p && i < 20; i++) { if (p.visible === false) return false; const dc = p.declaredClass || ''; if (dc === 'esri.Map' || dc === 'esri.WebMap') return true; p = p.parent } return true }
            const addLeaf = (l: any) => { const t = String(l.title ?? l.name ?? '').trim(); if (t) on.push(t) }
            allLayers.forEach((l: any) => {
                if (!l || this.telemetrySkips(l) || l.declaredClass === 'esri.layers.GroupLayer' || !drawing(l)) return
                const subs = l.allSublayers
                if (subs && typeof subs.forEach === 'function' && subs.length) {
                    subs.forEach((s: any) => { if (s && !(s.sublayers && s.sublayers.length) && drawing(s)) addLeaf(s) })
                } else addLeaf(l)
            })
            const down = Array.from(this._serviceDown.values()).filter(Boolean).length
            const head = `on ${on.length} | down ${down} | broken ${this._brokenReported.size} | `
            let names = ''
            for (const n of on) { const piece = (names ? '; ' : '') + n.replace(/[|;]/g, ' '); if (head.length + names.length + piece.length > 240) { names += names ? '; ...' : '...'; break } names += piece }
            const detail = head + names
            const now = Date.now()
            if (detail !== this._lastStatus || now - this._lastStatusAt > 15 * 60000) {
                this._lastStatus = detail; this._lastStatusAt = now
                this.beacon.action('layers-status', detail)
            }
        } catch (e) { /* status is best effort */ }
        next()
    }

    // ==================== Layer health (service not answering) ====================

    // Service root url for a layer, or null for layers with nothing to ping (groups, graphics,
    // the draw layer). Sublayers report their parent service so one request covers them all.
    healthUrlFor(layer: any): string | null {
        if (!layer) return null
        if (layer.declaredClass === 'esri.layers.GroupLayer') return null
        if (layer.declaredClass === 'esri.layers.support.Sublayer') return this.healthUrlFor(layer.layer)
        if (typeof layer.id === 'string' && layer.id.startsWith('jimu-draw')) return null
        // Basemap layers are not in the list; leave them to the basemap switcher.
        if (layer.parent && layer.parent.declaredClass === 'esri.Basemap') return null
        const url = layer.url
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null
        return url.replace(/\/+$/, '')
    }

    startLayerHealth() {
        this.stopLayerHealth()
        const config: any = this.props.config || {}
        if (!config.useMapWidget || !config.enableLayerHealth) return
        this._healthTimer = setTimeout(() => { this.runLayerHealth() }, 4000)
    }

    stopLayerHealth() {
        if (this._healthTimer) {
            clearTimeout(this._healthTimer)
            this._healthTimer = null
        }
    }

    scheduleNextHealth() {
        this.stopLayerHealth()
        if (this._unmounted) return
        const config: any = this.props.config || {}
        if (!config.enableLayerHealth) return
        const minutes = Math.max(1, Math.min(120, Number(config.layerHealthMinutes) || 5))
        this._healthTimer = setTimeout(() => { this.runLayerHealth() }, minutes * 60000)
    }

    // Asks every distinct service behind the list for its JSON description (esri/request, so
    // the app's sign-in and proxy rules apply and the CityMap fetch shim is bypassed). A
    // service that errors or times out is "not answering": its layers get a note in the list
    // and the outage is reported once. Recovery clears the note and is reported too.
    async runLayerHealth() {
        if (this._healthRunning || this._unmounted) return
        this._healthRunning = true
        try {
            if (!this._esriRequest) {
                const mods = await loadArcGISJSAPIModules(['esri/request'])
                this._esriRequest = mods[0]
            }
            const view = this.viewFromMapWidget || this.jmvFromMap?.view
            const allLayers = view?.map?.allLayers
            if (!allLayers || this._unmounted) return
            const byUrl: Map<string, any[]> = new Map()
            allLayers.forEach((layer: any) => {
                const url = this.healthUrlFor(layer)
                if (!url) return
                if (!byUrl.has(url)) byUrl.set(url, [])
                byUrl.get(url).push(layer)
            })
            const urls = Array.from(byUrl.keys())
            const batch = 4
            for (let i = 0; i < urls.length && !this._unmounted; i += batch) {
                await Promise.all(urls.slice(i, i + batch).map(async (url: string) => {
                    let ok = true
                    try {
                        const res = await this._esriRequest(url, { query: { f: 'json' }, responseType: 'json', timeout: 10000 })
                        if (!res || !res.data || res.data.error) ok = false
                        // The service answers but a sublayer the map uses is gone from it.
                        else if (Array.isArray(res.data.layers)) {
                            const ids = new Set(res.data.layers.map((x: any) => Number(x.id)))
                            ;(byUrl.get(url) || []).forEach((lyr: any) => {
                                const subs = lyr.allSublayers || lyr.sublayers
                                if (subs && typeof subs.forEach === 'function' && lyr.declaredClass !== 'esri.layers.support.Sublayer') {
                                    subs.forEach((sub: any) => { if (sub && typeof sub.id === 'number' && !ids.has(sub.id)) this.reportBrokenLayer(sub, null, 'missing') })
                                }
                            })
                        }
                    } catch (e) { ok = false }
                    const wasDown = this._serviceDown.get(url) === true
                    if (!ok && !wasDown) {
                        this._serviceDown.set(url, true)
                        this.beacon?.action('layer-unreachable', String(byUrl.get(url)[0]?.title ?? url))
                    } else if (ok && wasDown) {
                        this._serviceDown.delete(url)
                        this.beacon?.action('layer-recovered', String(byUrl.get(url)[0]?.title ?? url))
                    }
                }))
            }
            this.refreshHealthMarks()
        } catch (e) {
            this.beacon?.error(e, 'layer-health')
        } finally {
            this._healthRunning = false
            this.scheduleNextHealth()
        }
    }

    refreshHealthMarks() {
        this.refreshAllTitles()
    }

    // ==================== List titles (clean names, favorite star, health note) ====================

    // The name shown for a layer: the web map title, cleaned when the builder asked for it.
    // The layer's own title is never changed.
    displayTitle(layer: any): string {
        const config: any = this.props.config || {}
        const original = String(layer?.title ?? '')
        const cleaned = cleanTitle(original, {
            clean: !!config.cleanLayerNames,
            prefix: config.cleanNamePrefix || '',
            titleCase: !!config.cleanNameTitleCase
        })
        if (!config.translateLayerNames) return cleaned
        // The web map name first (exact match), then the cleaned one.
        const opts = this.nameOptions()
        const locale = this.appLocale()
        const byOriginal = translateName(original, locale, opts, this._nameMemory || undefined)
        if (byOriginal !== original) return byOriginal
        return translateName(cleaned, locale, opts, this._nameMemory || undefined)
    }

    // ==================== Layer names in the app language ====================

    // The app language: the widget intl (?locale=, browser, ArcGIS profile, Language Switcher).
    appLocale(): string {
        const intl: any = (this.props as any).intl
        let loc: string = intl?.locale || ''
        if (!loc) { try { loc = (getAppStore().getState() as any)?.appContext?.locale || '' } catch (e) { /* no store */ } }
        return loc || (typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en'
    }

    nameOptions() {
        const config: any = this.props.config || {}
        const plain = (v: any) => (v && typeof v.asMutable === 'function' ? v.asMutable({ deep: true }) : v)
        return {
            overrides: plain(config.layerNameOverrides) || {},
            keep: plain(config.layerNameKeep) || [],
            useMemory: config.layerNamesFromMemory !== false,
            memoryUrl: config.layerNameMemoryUrl || DEFAULT_MEMORY_URL,
            mtUrl: config.layerNameMtUrl || '',
            mtApiKey: config.layerNameMtKey || ''
        }
    }

    // Every web map title in the list (and its cleaned form), for the machine-translation fallback.
    listTitles(): string[] {
        const out: string[] = []
        const list: any = this.layerListRef && this.layerListRef.current
        if (!list || !list.operationalItems) return out
        const config: any = this.props.config || {}
        const walk = (items: any) => {
            const arr = items.toArray ? items.toArray() : items
            for (const item of arr) {
                const t = String(item?.layer?.title ?? '')
                if (t) out.push(cleanTitle(t, { clean: !!config.cleanLayerNames, prefix: config.cleanNamePrefix || '', titleCase: !!config.cleanNameTitleCase }))
                if (item?.children && item.children.length > 0) walk(item.children)
            }
        }
        walk(list.operationalItems)
        return out
    }

    // Loads what the current locale needs and redraws the list titles. Cheap when nothing changed.
    syncNameLanguage() {
        const config: any = this.props.config || {}
        const locale = this.appLocale()
        const opts = this.nameOptions()
        const key = [config.translateLayerNames ? 1 : 0, memoryLocale(locale), opts.useMemory ? opts.memoryUrl : '', opts.mtUrl,
            JSON.stringify(opts.overrides), JSON.stringify(opts.keep)].join('|')
        if (key === this._nameKey) return
        const localeChanged = memoryLocale(locale) !== this._nameLocale
        this._nameKey = key
        this._nameLocale = memoryLocale(locale)
        if (!config.translateLayerNames) { this._nameMemory = null; this.refreshAllTitles(); return }
        if (localeChanged) this._nameMemory = null
        this.refreshAllTitles() // overrides and keep list apply right away
        const seq = ++this._nameSeq
        ;(async () => {
            const memory = opts.useMemory ? await loadMemory(opts.memoryUrl, locale) : null
            if (this._unmounted || seq !== this._nameSeq) return
            this._nameMemory = memory
            this.refreshAllTitles()
            if (opts.mtUrl) {
                const missing = this.listTitles().filter(t => translateName(t, locale, opts, memory || undefined) === t)
                await machineTranslate(missing, locale, opts.mtUrl, opts.mtApiKey)
                if (this._unmounted || seq !== this._nameSeq) return
                this.refreshAllTitles()
            }
        })()
    }

    // Sets a list item's title from the display name plus its marks. Safe to call often:
    // it only writes when the value changes, so the LayerList does not re-render for nothing.
    refreshItemTitle(listItem: any) {
        const layer: any = listItem?.layer
        if (!layer) return
        const config: any = this.props.config || {}
        const url = this.healthUrlFor(layer)
        const down = !!config.enableLayerHealth && !!url && this._serviceDown.get(url) === true
        const fav = !!config.enableFavorites && layer.declaredClass !== 'esri.layers.GroupLayer' && isFavorite(this.props.id, layer.id)
        const next = decorateTitle(this.displayTitle(layer), { favorite: fav, unavailable: down ? this.translate('layerUnavailable') : undefined })
        try { if (listItem.title !== next) listItem.title = next } catch (e) { /* title not settable on this item */ }
    }

    refreshAllTitles() {
        const list: any = this.layerListRef && this.layerListRef.current
        if (!list || !list.operationalItems) return
        const walk = (items: any) => {
            const arr = items.toArray ? items.toArray() : items
            for (const item of arr) {
                if (!item) continue
                this.refreshItemTitle(item)
                if (item.children && item.children.length > 0) walk(item.children)
            }
        }
        walk(list.operationalItems)
    }

    // ==================== Pick one layer per group (radio buttons) ====================

    // The group jimuLayerViewIds configured for the active map view, or an empty
    // set when the option is off. Same check the settings panel and the help
    // guide use, so the three never disagree.
    pickOneGroupIdSet(): Set<string> {
        const config: any = this.props.config || {}
        if (!config.useMapWidget || !config.enablePickOneGroups) return new Set<string>()
        const ids = config.pickOneGroupIds?.[this.state.jimuMapViewId]
        return new Set<string>(ids ? Array.from(ids) as string[] : [])
    }

    // Walks the map and puts every configured GroupLayer into the SDK's
    // exclusive visibility mode (one child on at a time). Before flipping the
    // mode, trims the group to a single visible child (the one highest in the
    // list) so the SDK never sees two radio buttons on. Groups that were
    // switched by an earlier apply but are no longer configured go back to
    // their original mode.
    applyPickOneGroups() {
        const wanted = this.pickOneGroupIdSet()
        this.restorePickOneGroups(wanted)
        if (wanted.size === 0) return
        const jmv = this.jimuMapView
        const view = this.viewFromMapWidget || jmv?.view
        const map = view && view.map
        if (!jmv || !map || !map.layers) return

        const visit = (layers: any) => {
            if (!layers) return
            const arr: any[] = layers.toArray ? layers.toArray() : (Array.isArray(layers) ? layers : [])
            for (const layer of arr) {
                if (!layer) continue
                if (layer.declaredClass === 'esri.layers.GroupLayer') {
                    let jlvId: string = null
                    try { jlvId = jmv.getJimuLayerViewIdByAPILayer(layer) } catch (e) { /* unresolved */ }
                    if (jlvId && wanted.has(jlvId)) {
                        try {
                            if (!this._pickOneOriginalModes.has(layer)) {
                                this._pickOneOriginalModes.set(layer, layer.visibilityMode || 'independent')
                            }
                            this.trimToOneVisibleChild(layer)
                            if (layer.visibilityMode !== 'exclusive') layer.visibilityMode = 'exclusive'
                        } catch (e) { /* some layers refuse the mode; leave them */ }
                    }
                    visit(layer.layers)
                }
            }
        }
        visit(map.layers)
    }

    // Leaves at most one child visible in a group: the topmost in the list
    // (the last one in the collection, since the list draws in reverse order).
    trimToOneVisibleChild(group: any) {
        const children: any[] = group?.layers?.toArray ? group.layers.toArray() : []
        let keep: any = null
        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i]
            if (child && child.visible === true) { keep = child; break }
        }
        if (!keep) return
        for (const child of children) {
            if (child && child !== keep && child.visible === true) {
                try { child.visible = false } catch (e) { /* noop */ }
            }
        }
    }

    // Puts back the original visibilityMode on every group this widget changed
    // that is not in `keep`. Called with an empty set on unmount.
    restorePickOneGroups(keep: Set<string>) {
        if (!this._pickOneOriginalModes || this._pickOneOriginalModes.size === 0) return
        const jmv = this.jimuMapView
        this._pickOneOriginalModes.forEach((mode: string, layer: any) => {
            let jlvId: string = null
            try { jlvId = jmv ? jmv.getJimuLayerViewIdByAPILayer(layer) : null } catch (e) { /* unresolved */ }
            if (jlvId && keep.has(jlvId)) return
            try { if (layer && !layer.destroyed) layer.visibilityMode = mode } catch (e) { /* noop */ }
            this._pickOneOriginalModes.delete(layer)
        })
    }

    // Watches the map's top-level layer collection. When a layer is added there
    // at runtime (e.g. dragged out of a group), promote it so the whitelist
    // filter does not hide it, and reveal it in the current list immediately.
    setupReparentPromotion(layerList: any) {
        try {
            const view = this.viewFromMapWidget || this.jmvFromMap?.view
            const map = view && view.map
            if (!map || !map.layers || typeof map.layers.on !== 'function') return
            if (this._reparentHandle && typeof this._reparentHandle.remove === 'function') {
                this._reparentHandle.remove()
            }
            // 'after-add' fires only for layers added AFTER this point, so the
            // initial (already-present) layers are not affected — only moves.
            // IMPORTANT: this only re-applies visibility to layers that were
            // EXPLICITLY promoted (via "move out of group"). It must NOT add
            // layers to the promoted set on its own, or a plain reorder (which
            // removes and re-adds a layer/group to the map) would wrongly
            // bypass the customize whitelist and reveal hidden layers.
            this._reparentHandle = map.layers.on('after-add', (event: any) => {
                const lyr = event && event.item
                if (lyr && lyr.id != null && this._promotedLayerIds.has(lyr.id)) {
                    try {
                        const item = this.findListItemByLayer(layerList.operationalItems, lyr)
                        if (item) item.hidden = false
                    } catch (e) { /* noop */ }
                }
            })
        } catch (e) { /* noop */ }
    }

    // New function to set up watchers for layer visibility changes
    setLayerVisibilityWatchers(layerList: any) {
        if (!layerList || !layerList.operationalItems) return;

        this.watchLayerItemsVisibility(layerList.operationalItems);

        // Add multiple delayed checks to ensure functionality works in production environment
        setTimeout(() => {
            this.ensureTopLevelGroupsExpanded(layerList.operationalItems);
            // Re-setup watchers in case they weren't properly established
            this.watchLayerItemsVisibility(layerList.operationalItems);
        }, 1000);

        // Additional check for production environments with slower authentication
        setTimeout(() => {
            this.ensureTopLevelGroupsExpanded(layerList.operationalItems);
            this.watchLayerItemsVisibility(layerList.operationalItems);
        }, 3000);

        // Final check to ensure everything is working
        setTimeout(() => {
            this.ensureTopLevelGroupsExpanded(layerList.operationalItems);
        }, 5000);
    }

    // Function to ensure top-level groups are expanded (for Enterprise authentication)
    ensureTopLevelGroupsExpanded(items: any) {
        if (!items) return;

        items.forEach(item => {
            // Set top-level group layers to always be expanded
            if (item.children && item.children.length > 0) {
                item.open = true;
            }
        });
    }

    // Walks a layer's parent chain and switches every ancestor group layer on,
    // so that turning a (possibly auto-included) sub-layer on actually renders
    // it. Guarded against loops: only sets visible=true (a no-op when already
    // true, so the JSAPI does not re-fire the watcher). Also expands the
    // ancestor list items so a deeply-nested layer is revealed in the tree even
    // when an intermediate group was already visible but collapsed.
    ensureAncestorsVisible(layer: any) {
        let parent: any = layer && layer.parent
        while (parent && parent.declaredClass) {
            // Only force real layers (group layers, map-image layers, etc.) on.
            // Skip Sublayers: poking their visibility here makes the SDK log a
            // per-sublayer warning, and child sublayers are gated by the parent
            // service layer's visibility anyway.
            const isSublayer = parent.declaredClass === 'esri.layers.support.Sublayer'
            if (!isSublayer && typeof parent.visible === 'boolean' && parent.visible !== true) {
                this._autoParentOn.add(parent)
                try { parent.visible = true } catch (e) { /* some layers are not toggleable */ }
            }
            parent = parent.parent;
        }
        this.openAncestorListItems(layer);
    }

    // Finds the list item wrapping a given layer and opens all of its ancestor
    // list items (expanding nested groups in the UI).
    openAncestorListItems(layer: any) {
        const list: any = this.layerListRef && this.layerListRef.current
        if (!list || !list.operationalItems || !layer) return;
        const found = this.findListItemByLayer(list.operationalItems, layer);
        if (!found) return;
        let p: any = found.parent;
        while (p) {
            p.open = true;
            p = p.parent;
        }
    }

    findListItemByLayer(items: any, layer: any): any {
        if (!items) return null;
        const arr = items.toArray ? items.toArray() : items;
        for (const item of arr) {
            if (item && item.layer === layer) return item;
            if (item && item.children && item.children.length > 0) {
                const child = this.findListItemByLayer(item.children, layer);
                if (child) return child;
            }
        }
        return null;
    }

    // New recursive function to watch all items including nested ones
    watchLayerItemsVisibility(items: any, isTopLevel: boolean = true) {
        if (!items) return;

        items.forEach(item => {
            // Set top-level group layers to always be expanded
            if (isTopLevel && item.children && item.children.length > 0) {
                item.open = true;
            }

            // Watch for visibility changes - handle both layer and item properties
            if (item.layer) {
                // Remove any existing watcher to prevent duplicates
                if ((item as any)._visibilityHandle) {
                    (item as any)._visibilityHandle.remove();
                }

                // Set up the visibility watcher
                const handle = item.layer.watch('visible', (visible) => {
                    // When a layer is switched on, make sure its parent group
                    // layers are on too — otherwise a surfaced sub-layer whose
                    // group is off will tick on but never render.
                    if (visible && this.props.config?.autoShowParentLayers !== false) {
                        this.ensureAncestorsVisible(item.layer);
                    }
                    // For top-level group layers: always keep them expanded regardless of visibility
                    if (isTopLevel && item.children && item.children.length > 0) {
                        item.open = true;
                    }
                    // For nested group layers: expand when turned on, collapse when turned off
                    else if (item.children && item.children.length > 0 && !isTopLevel) {
                        if (!this._spotlightAdjusting) item.open = visible;
                    }
                });

                // Store handle for cleanup
                (item as any)._visibilityHandle = handle;
            }

            // Also watch the item's visible property as a fallback
            if (item.children && item.children.length > 0) {
                // Remove any existing item watcher
                if ((item as any)._itemVisibilityHandle) {
                    (item as any)._itemVisibilityHandle.remove();
                }

                const itemHandle = item.watch('visible', (visible) => {
                    // For top-level group layers: always keep them expanded
                    if (isTopLevel) {
                        item.open = true;
                    }
                    // For nested group layers: expand/collapse based on visibility
                    else {
                        if (!this._spotlightAdjusting) item.open = visible;
                    }
                });

                (item as any)._itemVisibilityHandle = itemHandle;
            }

            // Recursively watch children (with isTopLevel=false for the next level)
            if (item.children) {
                this.watchLayerItemsVisibility(item.children, false);
            }
        });
    }

    defineLayerListActionsGenerator = (isTableList = false) => {
        return (event) => {
            const listItem = event.item
            let actionGroups = {}
            listItem.actionsSections = []

            // While Layer focus is entering/exiting, a list rebuild recreates
            // items defaulting to collapsed. Restore this item's expand state at
            // creation so it is never rendered collapsed (no flicker).
            if (this._spotlightAdjusting && this._spotlightOpenBackup && listItem.layer) {
                const k = listItem.layer.uid
                if (k != null && this._spotlightOpenBackup.has(k)) {
                    try { listItem.open = this._spotlightOpenBackup.get(k) } catch (e) { /* noop */ }
                }
            }

            // Display name plus marks (favorite star, service note) survive list rebuilds.
            if (!isTableList && listItem.layer) this.refreshItemTitle(listItem)

            if (!isTableList && this.props.config?.useMapWidget && this.props.config?.enableLegend && listItem.layer.legendEnabled) {
                if (typeof listItem.layer?.id !== 'string' || !listItem.layer.id.startsWith('jimu-draw')) {
                    listItem.panel = {
                        content: 'legend',
                        // The JSAPI handle the layer invisible case, it will not have a selected UI.
                        // https://devtopia.esri.com/WebGIS/arcgis-js-api/issues/51484
                        open: this.props.config?.showAllLegend
                    }
                }
            }

            // After this block, all native actions AND option-action are stored in the actionGroups
            this.layerListActions.forEach((actionObj) => {
                if (actionObj.isValid(listItem, isTableList)) {
                    let actionGroup = actionGroups[actionObj.group]
                    if (!actionGroup) {
                        actionGroup = []
                        actionGroups[actionObj.group] = actionGroup
                    }

                    actionGroup.push({
                        id: actionObj.id,
                        title: actionObj.title,
                        className: actionObj.className
                    })
                }
            })

            // When disable data-action, stay untouched
            // Otherwise, show up the custom popper
            const dataActionEnabled = this.props.enableDataAction ?? true
            const OPTION_ACTION_INDEX = ACTION_INDEXES.Option
            const showOptionActions = [ACTION_INDEXES.Label, ACTION_INDEXES.Transparency, ACTION_INDEXES.Popup, ACTION_INDEXES.VisibilityRange, ACTION_INDEXES.ChangeSymbol]

            // Extract the option-action for the minus 1
            const nativeActionCount = Object.keys(actionGroups).length - 1

            // Delete the fake option when: data-action disabled & Less than 1 native action & it's not transparency action
            // Otherwise, we go the fake option action way
            if (!dataActionEnabled && nativeActionCount <= 1 && !showOptionActions.some(index => !!actionGroups[index])) {
                delete actionGroups[OPTION_ACTION_INDEX]
            } else {
                actionGroups = { OPTION_ACTION_INDEX: actionGroups[OPTION_ACTION_INDEX] }
            }

            const customizeLayerOptions = this.props?.config?.customizeLayerOptions?.[this.state.jimuMapViewId]
            if (customizeLayerOptions && customizeLayerOptions.isEnabled) {
                const hiddenLayerSet = new Set<string>(Array.from(customizeLayerOptions?.hiddenJimuLayerViewIds ?? []) as string[])
                const showLayerSet = new Set<string>(Array.from(customizeLayerOptions?.showJimuLayerViewIds ?? []) as string[])
                const currentJimuLayerViewId = this.jimuMapView.getJimuLayerViewIdByAPILayer(listItem.layer)
                if (hiddenLayerSet.has(currentJimuLayerViewId)) {
                    listItem.hidden = true
                }

                if (customizeLayerOptions?.showJimuLayerViewIds) {
                    listItem.hidden = !showLayerSet.has(currentJimuLayerViewId)
                    // Auto-include: if the layer is NOT explicitly in the
                    // whitelist, but any of its ancestor group layers is
                    // marked for auto-include, show it. Lets newly added
                    // children of those groups appear without re-editing.
                    if (listItem.hidden) {
                        const autoIncludeIds = customizeLayerOptions?.autoIncludeChildrenGroupIds
                        if (autoIncludeIds && autoIncludeIds.length > 0) {
                            const autoIncludeSet = new Set<string>(Array.from(autoIncludeIds) as string[])
                            if (this.isUnderAutoIncludeGroup(listItem.layer, autoIncludeSet)) {
                                listItem.hidden = false
                            }
                        }
                    }
                }

                if (this.isLayerFromRuntime(listItem.layer)) {
                    listItem.hidden = !(customizeLayerOptions?.showRuntimeAddedLayers ?? true)
                }

                if (this.isWMTSSublayer(listItem.layer)) {
                    listItem.hidden = false
                }

                // Keep layers the user explicitly moved out of a group visible,
                // even though they no longer pass the group-based whitelist.
                if (this._promotedLayerIds && listItem.layer && this._promotedLayerIds.has(listItem.layer.id)) {
                    listItem.hidden = false
                }
            }

            Object.entries(actionGroups)
                .sort((v1, v2) => Number(v1[0]) - Number(v2[0]))
                .forEach(([key, value]) => {
                    listItem.actionsSections.push(value)
                })
        }
    }

    onActionListItemClick() {
        // Let the action popper find the reference DOM node
        setTimeout(() => {
            this.setState({ isActionListPopperOpen: false })
        }, 100)
    }

    onLayerListActionsTriggered = (event, isTableList = false) => {
        const action = event.action
        const listItem = event.item
        const actionObj = this.layerListActions.find(
            (actionObj) => actionObj.id === action.id
        )

        this.beacon?.action('apply-action', actionObj?.id)

        if (actionObj.id === 'option-action') {
            // Popup the window when click option-action
            const supportedActionObjects = this.layerListActions.filter((actionObj) => {
                return actionObj.isValid(listItem, isTableList) && actionObj.id !== 'option-action'
            })

            const shouldHideEmptyList = supportedActionObjects.length > 0
            const enableDataAction = this.props.enableDataAction ?? true

            // Create data action list in the next macro task so the optionBtnRef is the latest
            setTimeout(() => {
                const mapLayersDsActionList = <MapLayersActionList
                    widgetId={this.props.id}
                    jimuMapView={this.jimuMapView}
                    mapDataSource={this.dataSource}
                    actionObjects={supportedActionObjects}
                    listItem={listItem} onActionListItemClick={() => { this.onActionListItemClick() }}
                    enableDataAction={enableDataAction}
                    shouldHideEmptyList={shouldHideEmptyList}
                    optionBtnRef={this.optionBtnRef}
                >
                </MapLayersActionList>

                this.setState({ actionListDOM: mapLayersDsActionList })
            }, 0)
        } else {
            // A native action
            const actionElement = actionObj.execute(listItem)
            if (actionElement) {
                this.setState({
                    nativeActionPopper: actionElement
                })
            }
        }
    }

    async renderLayerList() {
        try {
            const view = await this.createView() as any | any
            if (this.props.config?.showTables) {
                await this.renderTableList()
            }
            if (this._unmounted) return
            const layerList = await this.createLayerList(view)
            if (this._unmounted || !layerList) return
            this.setState({
                listLoadStatus: LoadStatus.Fulfilled,
                headerKey: Math.random().toString()
            })
        } catch (error) {
            this.beacon?.error(error, 'load-layers')
            console.error(error)
        }
    }

    async renderTableList() {
        try {
            const view = await this.createView() as any | any
            if (this._unmounted) return
            if (this.props.config?.showTables) {
                const tableList = await this.createTableList(view)
                if (this._unmounted || !tableList) return
                this.setState({ tableLoadStatus: LoadStatus.Fulfilled })
            } else {
                this.destroyTableList()
            }
        } catch (error) {
            this.beacon?.error(error, 'load-tables')
            console.error(error)
        }
    }

    async syncRenderer(preRenderPromise) {
        if (this._unmounted) return
        this.jimuMapView = MapViewManager.getInstance().getJimuMapViewById(this.state.jimuMapViewId)

        // The datasource mode does not have a jimuMapView
        if (this.jimuMapView) {
            await this.jimuMapView.whenJimuMapViewLoaded()
        }
        await preRenderPromise
        if (this._unmounted) return

        this.renderPromise = this.renderLayerList()
    }

    private readonly _addJlvCreatedListener = (jlv: JimuLayerView) => {
        if (jlv.fromRuntime) {
            this.syncRenderer(this.renderPromise)
        }
    }

    onActiveViewChange = (jimuMapView: JimuMapView) => {
        const useMapWidget =
            this.props.useMapWidgetIds && this.props.useMapWidgetIds[0]
        // Remove the previous listener so the callback will not be invoked multiple times
        if (this.jmvFromMap) {
            this.jmvFromMap.removeJimuLayerViewCreatedListener(this._addJlvCreatedListener)
        }
        if ((jimuMapView && jimuMapView.view) || !useMapWidget) {
            this.jmvFromMap = jimuMapView

            jimuMapView.addJimuLayerViewCreatedListener(this._addJlvCreatedListener)

            this.viewFromMapWidget = jimuMapView && jimuMapView.view
            this.setupLayerTelemetry(this.viewFromMapWidget)
            this.setState({
                nativeActionPopper: null
            }, function afterPopperClose() {
                this.setState({
                    mapWidgetId: useMapWidget,
                    jimuMapViewId: jimuMapView.id,
                })
            })
        } else {
            this.destroyLayerList()
        }
    }

    onDataSourceCreated = (dataSource: MapDataSource): void => {
        this.dataSource = dataSource
        this.setState({
            mapDataSourceId: dataSource.id,
        })
    }

    isLayerFromRuntime = (layer): boolean => {
        if (this.isWMTSSublayer(layer)) {
            return false
        }

        return layer[ExBAddedJSAPIProperties.EXB_LAYER_FROM_RUNTIME]
    }

    isWMTSSublayer(layer: any): boolean {
        let parentLayer = layer.parent
        const layerTypes: string[] = [
            'esri.layers.WMTSLayer'
        ]

        while (parentLayer) {
            if (layerTypes.includes(parentLayer.declaredClass)) {
                return true
            }
            parentLayer = (parentLayer as any).parent
        }

        return false
    }

    // Walks the layer's parent chain. Returns true if any ancestor's
    // jimuLayerViewId is in the auto-include set (i.e. the user has
    // toggled "auto-include new sub-layers" on for that group).
    isUnderAutoIncludeGroup = (layer: any, autoIncludeSet: Set<string>): boolean => {
        if (!autoIncludeSet || autoIncludeSet.size === 0 || !this.jimuMapView) {
            return false
        }
        let parentLayer: any = (layer as any).parent
        while (parentLayer && parentLayer.declaredClass) {
            try {
                const parentJlvId = this.jimuMapView.getJimuLayerViewIdByAPILayer(parentLayer)
                if (parentJlvId && autoIncludeSet.has(parentJlvId)) {
                    return true
                }
            } catch (e) {
                // Some intermediate layers (e.g. map root) may not resolve
                // to a jimuLayerViewId — that's fine, keep walking.
            }
            parentLayer = parentLayer.parent
        }
        return false
    }

    async getAllLayers(layerCollection, result = []) {
        const specialLayerTypes = [
            'esri.layers.WMSLayer',
            'esri.layers.support.WMSSublayer',
            'esri.layers.WMTSLayer',
            'esri.layers.support.WMTSSublayer',
            'esri.layers.KMLLayer',
            'esri.layers.support.KMLSublayer',
            'esri.layers.CatalogLayer',
            'esri.layers.catalog.CatalogDynamicGroupLayer',
            'esri.layers.catalog.CatalogFootprintLayer',
            'esri.layers.KnowledgeGraphLayer',
            'esri.layers.knowledgeGraph.KnowledgeGraphSublayer',
            'esri.layers.LinkChartLayer',
            // The GroupLayer may contain special layers
            'esri.layers.GroupLayer',
        ]

        for (const layer of layerCollection) {
            // Only load types of layer above
            if (!specialLayerTypes.includes(layer.declaredClass)) {
                continue
            }
            // Call load so the layers/sublayers field is ready
            if (layer.load) {
                await layer.load()
            }
            result.push(layer) // Add current layer

            if (layer.layers) {
                await this.getAllLayers(layer.layers, result)
            } else if (layer.sublayers) {
                await this.getAllLayers(layer.sublayers, result)
            }
        }
        return result
    }

    // This is for compatible with app that toggle on customize layers before 1.18.0
    getOldVersionUnselectableSublayer(layer: any, jmv: JimuMapView, oldSublayersSetMap: Map<string, Set<string>>): boolean {
        const specialParentLayerTypes = [
            'esri.layers.WMSLayer',
            'esri.layers.WMTSLayer',
            'esri.layers.KMLLayer',
            'esri.layers.CatalogLayer',
            'esri.layers.KnowledgeGraphLayer',
            'esri.layers.LinkChartLayer'
        ]

        const currentJimuLayerViewId = jmv.getJimuLayerViewIdByAPILayer(layer)
        let parentLayer = layer.parent
        while (parentLayer) {
            if (specialParentLayerTypes.includes(parentLayer.declaredClass)) {
                if (oldSublayersSetMap.has(jmv.id)) {
                    oldSublayersSetMap.get(jmv.id).add(currentJimuLayerViewId)
                } else {
                    const set = new Set<string>()
                    set.add(currentJimuLayerViewId)
                    oldSublayersSetMap.set(jmv.id, set)
                }
                return true
            }
            parentLayer = (parentLayer as any).parent
        }

        return false
    }

    editWidgetConfig = (jmvIds: string[]) => {
        let newConfig = this.props.config

        for (const jmvId of jmvIds) {
            const oldShowJlvIds = this.props.config.customizeLayerOptions?.[jmvId]?.showJimuLayerViewIds || []
            const sublayerIdsSet = this.oldSublayersSetMap.get(jmvId)
            if (sublayerIdsSet) {
                newConfig = newConfig.setIn(['customizeLayerOptions', jmvId, 'showJimuLayerViewIds'], [...oldShowJlvIds, ...sublayerIdsSet])
            }
        }

        let appConfig = getAppStore().getState().appConfig
        appConfig = appConfig.setIn(['widgets', this.props.id, 'config'], newConfig)
        getAppStore().dispatch(appActions.appConfigChanged(appConfig))
        this.setState({
            oldConfigUpdated: true
        })
    }

    upgradeOldSublayerConfig = async (jmvs: { [jmvId: string]: JimuMapView }) => {
        const originVersion = this.props.originVersion
        if (!originVersion || !semver.lt(originVersion, '1.18.0') || this.state.oldConfigUpdated) {
            return
        }

        for (const jmvId of Object.keys(jmvs)) {
            const isCustomized = this.props.config.customizeLayerOptions?.[jmvId]?.isEnabled
            const showJlvIds = this.props.config.customizeLayerOptions?.[jmvId]?.showJimuLayerViewIds
            // Do not update app that still uses hiddenList
            if (showJlvIds === undefined) {
                break
            }
            if (isCustomized) {
                const jmv = jmvs[jmvId]
                const allLayers = await this.getAllLayers(jmv.view.map.layers)
                for (const layer of allLayers) {
                    this.getOldVersionUnselectableSublayer(layer, jmv, this.oldSublayersSetMap)
                }
            }
        }

        if (this.oldSublayersSetMap.size > 0) {
            this.editWidgetConfig(Object.keys(jmvs))
        }
    }

    onToggleActionsPopper = () => {
        this.setState({ isActionListPopperOpen: false, actionListDOM: null })
        if (isKeyboardMode()) {
            const focusableElements: HTMLElement[] = getFocusableElements(this.optionBtnRef.current)
            focusElementInKeyboardMode(focusableElements[0])
        }
    }

    toggleExpand = (operationalItems: any, expand: boolean) => {
        for (const item of operationalItems) {
            item.open = expand
            if (item.children) {
                this.toggleExpand(item.children, expand)
            }
        }
    }

    // Exit the spotlight/focus mode: restore all layer visibility and hide the
    // focus overlay.
    onExitFocus = () => {
        if (this.state.spotlightExiting) return
        this.beacon?.action('exit-focus')
        try { this.setState({ spotlightExiting: true }) } catch (e) { /* noop */ }
        try { restoreSpotlight(this, { deferOverlayDismiss: true }) } catch (e) { /* noop */ }
    }

    render() {
    __setIntl((this.props as any).intl)
        const useMapWidget = this.props.useMapWidgetIds && this.props.useMapWidgetIds[0]
        const useDataSource = this.props.useDataSources && this.props.useDataSources[0]

        this.currentUseMapWidgetId = useMapWidget
        this.currentUseDataSourceId = useDataSource && useDataSource.dataSourceId

        let dataSourceContent = null
        if (this.props.config.useMapWidget) {
            dataSourceContent = (
                <JimuMapViewComponent
                    useMapWidgetId={this.props.useMapWidgetIds?.[0]}
                    onActiveViewChange={this.onActiveViewChange}
                    onViewsCreate={(jmvs) => {
                        this.upgradeOldSublayerConfig(jmvs)
                    }}
                />
            )
        } else if (useDataSource) {
            dataSourceContent = (
                <DataSourceComponent
                    useDataSource={useDataSource}
                    onDataSourceCreated={this.onDataSourceCreated}
                    onCreateDataSourceFailed={(err) => { console.error(err) }}
                />
            )
        }

        let content = null
        if (this.props.config.useMapWidget ? !useMapWidget : !useDataSource) {
            this.destroyLayerList()
            content = (
                <div className="widget-layerlist">
                    <WidgetPlaceholder
                        icon={layerListIcon}
                        name={this.translate('_widgetLabel')}
                        widgetId={this.props.id}
                    />
                </div>
            )
        } else {
            let loadingContent = null
            if (this.state.listLoadStatus === LoadStatus.Pending) {
                loadingContent = <div className="jimu-secondary-loading" />
            }

            // The header always renders once the list has loaded: it carries the Help button
            // (shared help pattern) even when every other header control is switched off.
            const shouldShowHeader = !loadingContent

            const isCollapsible = this.props.config?.collapsibleList ?? false
            const isCollapsed = isCollapsible && this.state.isListCollapsed

            content = (
                <div className={`widget-layerlist widget-layerlist_${this.props.id}`}>
                    {shouldShowHeader &&
                        <MapLayersHeader
                            // Do not re-use the component when the layerlist rerenders, only rerender when the layerlist is refreshed
                            // This key will affect the whole component, do not render till need to, see #28550
                            headerKey={this.state.headerKey}
                            theme={this.props.theme}
                            jimuMapViewId={this.state.jimuMapViewId}
                            layerListRef={this.layerListRef}
                            tableListRef={this.tableListRef}
                            enableSearch={this.props.config.searchLayers ?? false}
                            enableBatchOption={this.props.config.layerBatchOptions ?? false}
                            isMapWidgetMode={this.props.config?.useMapWidget}
                            expandAllLayers={this.props.config?.expandAllLayers}
                            showLayerCount={this.props.config?.showLayerCount ?? false}
                            collapsible={isCollapsible}
                            isCollapsed={isCollapsed}
                            onToggleCollapse={() => { this.setState({ isListCollapsed: !this.state.isListCollapsed }) }}
                            filterPlaceholder={this.props.config?.filterPlaceholder}
                            viewFromMapWidget={this.viewFromMapWidget}
                            widgetId={this.props.id}
                            enableLayerViews={this.props.config?.enableLayerViews ?? false}
                            autoShowParents={this.props.config?.autoShowParentLayers !== false}
                            enableAddLayer={this.props.config?.enableAddLayer ?? false}
                            enableMasterOpacity={this.props.config?.enableMasterOpacity ?? false}
                            enableBasemapSwitcher={this.props.config?.enableBasemapSwitcher ?? false}
                            enableLegendPanel={this.props.config?.enableLegendPanel ?? false}
                            enableShareLink={this.props.config?.enableShareLink ?? false}
                            onLinkCopied={() => { this.beacon?.action('copy-share-link') }}
                            searchDescriptions={this.props.config?.searchLayerDescriptions ?? false}
                            enableLayerCsv={this.props.config?.enableLayerCsv ?? false}
                            onCsvExported={() => { this.beacon?.action('export-layer-csv') }}
                            enableFavorites={this.props.config?.enableFavorites ?? false}
                            enableImagery={this.props.config?.enableImageryIndex ?? false}
                            imageryIndexUrl={this.props.config?.imageryIndexUrl}
                            onImageryAdded={(name: string) => { this.beacon?.action('add-imagery', name) }}
                            presets={this.currentPresets()}
                            onApplyPreset={(name: string) => { this.beacon?.action('apply-preset', name) }}
                            onHelp={this.props.config?.showHelp !== false ? this.openHelp : undefined}
                            helpLabel={this.t('helpTitle')}
                        ></MapLayersHeader>
                    }
                    {this.props.config?.showHelp !== false && (shouldShowHeader && this.state.showFirstRunHint) &&
                        <FirstRunHint
                            title={this.t('firstRunTitle')}
                            body={this.t('firstRunBody')}
                            linkLabel={this.t('firstRunHelpLink')}
                            dismissLabel={this.t('firstRunDismiss')}
                            onOpenHelp={this.openHelp}
                            onDismiss={this.dismissFirstRunHint}
                        />
                    }
                    <div className='map-layers-collapsible-region' style={{ display: isCollapsed ? 'none' : 'block' }}>
                        <div ref={this.layerListContainerRef} />
                        {
                            this.props.config.showTables && (
                                <React.Fragment>
                                    {
                                        (loadingContent === null && this.state.tableLoadStatus === LoadStatus.Fulfilled) &&
                                        <div className='table-list-divider d-flex align-items-center'>
                                            <TableOutlined></TableOutlined>
                                            <span className='ml-1'>{this.translate('tables')}</span>
                                        </div>
                                    }
                                    {
                                        (loadingContent === null && this.state.tableLoadStatus === LoadStatus.Pending) && <Loading type={LoadingType.DotsPrimary}></Loading>
                                    }
                                    <div ref={this.tableListContainerRef} className='table-list-wrapper' />
                                </React.Fragment>
                            )
                        }
                    </div>
                    {/* Fix double scroll bar problem in the widget controller */}
                    <div style={{ position: 'absolute', opacity: 0, top: 0, left: 0, zIndex: -1 }} ref={this.mapContainerRef}>
                        {this.translate('mapContainer')}
                    </div>
                    <div style={{ position: 'absolute', display: 'none' }}>
                        {dataSourceContent}
                    </div>
                </div>
            )
        }

        return (
            <Paper
                variant='flat'
                css={getStyle(this.props.theme, this.props.config)}
                className="jimu-widget"
                shape='none'
                style={{ position: 'relative' }}
            >
                {content}
                {
                    this.state.spotlightLayerName &&
                    <div
                        className="mlc-focus-overlay"
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
                    >
                        <div style={{ background: '#fff', borderRadius: 6, padding: '20px 24px', maxWidth: 320, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
                            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>{this.translate('spotlight')}</div>
                            {this.state.spotlightExiting
                                ? <div style={{ fontSize: 14, color: '#4a4a4a', lineHeight: 1.4 }}>
                                    {this.translate('restoringYourLayers')}
                                  </div>
                                : <React.Fragment>
                                    <div style={{ fontSize: 14, color: '#4a4a4a', marginBottom: 18, lineHeight: 1.4 }}>
                                        {this.translate('showingOnly')} <strong>{this.state.spotlightLayerName}</strong> {this.translate('onTheMapEveryOtherLayer')}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            onClick={this.onExitFocus}
                                            style={{ background: '#076fe5', color: '#fff', border: 'none', borderRadius: 4, padding: '7px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
                                        >
                                            {this.translate('exitFocus')}
                                        </button>
                                    </div>
                                  </React.Fragment>
                            }
                        </div>
                    </div>
                }
                {
                    this.state.actionListDOM &&
                    <Popper style={{ minWidth: '170px', overflow: 'hidden' }} keepMount reference={this.optionBtnRef.current} open={this.state.isActionListPopperOpen} toggle={this.onToggleActionsPopper}>
                        {this.state.actionListDOM}
                    </Popper>
                }
                {this.state.nativeActionPopper}
                <HelpPopup
                    open={this.state.helpOpen}
                    onClose={this.closeHelp}
                    sections={buildHelpSections(this.t, this.helpFeatures())}
                    title={this.t('helpTitle')}
                    intro={this.t('helpIntro')}
                    searchPlaceholder={this.t('helpSearchPlaceholder')}
                    noMatches={this.t('helpNoMatches')}
                    closeLabel={this.t('close')}
                />
            </Paper>
        )
    }
}

export default Widget