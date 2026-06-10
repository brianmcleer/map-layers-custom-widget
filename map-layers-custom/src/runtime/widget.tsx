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
import type { ReactNode } from 'react'
import MapLayersActionList from './components/map-layers-action-list'
import { TableOutlined } from 'jimu-icons/outlined/data/table'
import { getLayerListActions } from './actions'
import { restoreSpotlight } from './actions/spotlight'
import MapLayersHeader from './components/map-layers-header'
import { ACTION_INDEXES } from './actions/constants'

const allDefaultMessages = Object.assign({}, defaultMessages, jimuDefaultMessages)

export enum LoadStatus {
    Pending = 'Pending',
    Fulfilled = 'Fulfilled',
    Rejected = 'Rejected',
}

export interface WidgetProps extends AllWidgetProps<IMConfig> { }

export interface WidgetState {
    mapWidgetId: string
    jimuMapViewId: string
    mapDataSourceId: string
    listLoadStatus: LoadStatus
    tableLoadStatus: LoadStatus
    isActionListPopperOpen: boolean
    actionListDOM: ReactNode
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
}

interface ExtraProps {
    isDesignMode: boolean
    resourceSessions: ImmutableObject<ResourceSessions>
}

export class Widget extends React.PureComponent<WidgetProps & ExtraProps, WidgetState> {
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
            spotlightExiting: false
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

    componentDidMount() {
        this.bindClickHandler()
    }

    componentDidUpdate(prevProps: WidgetProps & ExtraProps, prevState: WidgetState) {
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
            // Put the layerlist render into the next marco task, so it will not slow down the setting panel UI
            setTimeout(() => {
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

        const container = document && document.createElement('div')
        container.className = 'table-list'
        this.tableListContainerRef.current.appendChild(container)

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

        const container = document && document.createElement('div')
        container.className = 'jimu-widget'
        this.layerListContainerRef.current.appendChild(container)

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

            // Keep any layer that gets moved OUT to the top level (via drag or
            // the Move-out menu) visible, even though it no longer matches the
            // group-based whitelist.
            this.setupReparentPromotion(layerList);
        })

        this.layerListRef.current = layerList
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
            this._reparentHandle = map.layers.on('after-add', (event: any) => {
                const lyr = event && event.item
                if (lyr && lyr.id != null) {
                    this._promotedLayerIds.add(lyr.id)
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
                const hiddenLayerSet = new Set(customizeLayerOptions?.hiddenJimuLayerViewIds)
                const showLayerSet = new Set(customizeLayerOptions?.showJimuLayerViewIds)
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
                            const autoIncludeSet = new Set(autoIncludeIds)
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
            await this.createLayerList(view)
            this.setState({
                listLoadStatus: LoadStatus.Fulfilled,
                headerKey: Math.random().toString()
            })
        } catch (error) {
            console.error(error)
        }
    }

    async renderTableList() {
        try {
            const view = await this.createView() as any | any
            if (this.props.config?.showTables) {
                await this.createTableList(view)
                this.setState({ tableLoadStatus: LoadStatus.Fulfilled })
            } else {
                this.destroyTableList()
            }
        } catch (error) {
            console.error(error)
        }
    }

    async syncRenderer(preRenderPromise) {
        this.jimuMapView = MapViewManager.getInstance().getJimuMapViewById(this.state.jimuMapViewId)

        // The datasource mode does not have a jimuMapView
        if (this.jimuMapView) {
            await this.jimuMapView.whenJimuMapViewLoaded()
        }
        await preRenderPromise

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
        try { this.setState({ spotlightExiting: true }) } catch (e) { /* noop */ }
        try { restoreSpotlight(this, { deferOverlayDismiss: true }) } catch (e) { /* noop */ }
    }

    render() {
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

            const shouldShowHeader = !loadingContent && (this.props.config.layerBatchOptions || this.props.config.searchLayers || this.props.config.showLayerCount || this.props.config.collapsibleList || this.props.config.enableLayerViews || this.props.config.enableAddLayer || this.props.config.enableMasterOpacity || this.props.config.enableBasemapSwitcher || this.props.config.enableLegendPanel)

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
                        ></MapLayersHeader>
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
                        mapContainer
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
                            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>Layer focus</div>
                            {this.state.spotlightExiting
                                ? <div style={{ fontSize: 14, color: '#4a4a4a', lineHeight: 1.4 }}>
                                    Restoring your layers…
                                  </div>
                                : <>
                                    <div style={{ fontSize: 14, color: '#4a4a4a', marginBottom: 18, lineHeight: 1.4 }}>
                                        Showing only <strong>{this.state.spotlightLayerName}</strong> on the map. Every other layer is hidden until you exit.
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            onClick={this.onExitFocus}
                                            style={{ background: '#076fe5', color: '#fff', border: 'none', borderRadius: 4, padding: '7px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
                                        >
                                            Exit focus
                                        </button>
                                    </div>
                                  </>
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
            </Paper>
        )
    }
}

export default Widget