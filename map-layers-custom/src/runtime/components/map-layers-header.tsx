/** @jsx jsx */
import { MapViewManager } from 'jimu-arcgis'
import { css, hooks, type IMThemeVariables, jsx, lodash, React } from 'jimu-core'
import { FilterOutlined } from 'jimu-icons/outlined/editor/filter'
import { SelectOptionOutlined } from 'jimu-icons/outlined/editor/select-option'
import { UpOutlined } from 'jimu-icons/outlined/directional/up'
import { DownOutlined } from 'jimu-icons/outlined/directional/down'
import { Button, Dropdown, DropdownButton, DropdownItem, DropdownMenu, TextInput, Tooltip } from 'jimu-ui'
import { CalciteIcon } from 'calcite-components'
import LayerViews from './layer-views'
import AddLayer from './add-layer'
import MasterOpacity from './master-opacity'
import BasemapSwitcher from './basemap-switcher'
import LegendPanel from './legend-panel'
import message from '../translations/default'
import { buildShareLink, visibleLayerIds } from '../lib/share-link'
import { buildLayerCsv } from '../lib/layer-csv'
import { buildSearchIndex, type SearchIndex } from '../lib/search-index'
import type { PresetViewProp } from './layer-views'
import { getFavorites, subscribeFavorites } from '../lib/favorites'

interface MapLayersHeaderProps {
    theme: IMThemeVariables
    jimuMapViewId: string
    layerListRef: React.MutableRefObject<any>
    tableListRef: React.MutableRefObject<any>
    enableSearch: boolean
    enableBatchOption: boolean
    expandAllLayers: boolean
    isMapWidgetMode: boolean
    headerKey: string
    // ---- new (enhanced fork) ----
    showLayerCount?: boolean
    collapsible?: boolean
    isCollapsed?: boolean
    onToggleCollapse?: () => void
    filterPlaceholder?: string
    viewFromMapWidget?: any
    widgetId?: string
    enableLayerViews?: boolean
    autoShowParents?: boolean
    enableAddLayer?: boolean
    enableMasterOpacity?: boolean
    enableBasemapSwitcher?: boolean
    enableLegendPanel?: boolean
    // In-widget help guide (shared pattern): the Help button sits at the far right
    // of this bar. Both are supplied by widget.tsx; the button renders when onHelp is set.
    onHelp?: () => void
    helpLabel?: string
    // "Copy link to these layers" in the batch menu (needs batch options).
    enableShareLink?: boolean
    onLinkCopied?: () => void
    // The search box also matches descriptions and tags (index built per list refresh).
    searchDescriptions?: boolean
    // "Export layer list (CSV)" in the batch menu (needs batch options).
    enableLayerCsv?: boolean
    onCsvExported?: () => void
    // Builder-authored preset views for this map view; shown even when saved views are off.
    presets?: PresetViewProp[]
    onApplyPreset?: (name: string) => void
    // "Show favorites only" in the batch menu.
    enableFavorites?: boolean
    // Add layer panel: "Imagery nearby" tab.
    enableImagery?: boolean
    imageryIndexUrl?: string
    onImageryAdded?: (name: string) => void
}

const getStyle = (theme: IMThemeVariables) => {
    return css`
    /* Narrow-width handling: let the toolbar wrap so the icon row (and the
       collapse chevron) drop to a second line instead of clipping. */
    &.map-layers-header { flex-wrap: wrap; row-gap: 4px; }
    .map-layers-header-icons { flex-wrap: wrap; justify-content: flex-end; margin-left: auto; row-gap: 4px; }
    .map-layers-search-input { flex: 1 1 140px; min-width: 0; }
    .map-layers-header-title { min-width: 0; }
    .map-layers-header-title{
      span {
        font-size: var(--calcite-font-size-0);
        font-weight: 500;
      }
    }
    .map-layers-batch-action-dropdown {
      button: hover {
        background: var(--calcite-color-transparent-hover);
      }
    }
    .map-layers-count-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--calcite-font-size--2);
      font-weight: 500;
      padding: 1px 8px;
      border-radius: 10px;
      white-space: nowrap;
      color: ${theme.sys.color.primary.text};
      background: ${theme.sys.color.primary.main};
    }
    .map-layers-count-badge.is-zero {
      color: ${theme.ref.palette.neutral[1000]};
      background: ${theme.ref.palette.neutral[400]};
    }
    .map-layers-match-count {
      font-size: var(--calcite-font-size--2);
      color: ${theme.ref.palette.neutral[900]};
      white-space: nowrap;
      align-self: center;
      margin-right: 4px;
    }
    .map-layers-collapse-btn {
      flex: 0 0 auto;
    }
  `
}

const { useState, useCallback, useEffect, useRef } = React

// Robust filter: tolerates list items without a layer or title (group nodes,
// tables, runtime layers still loading) and opens all matched ancestors so the
// match is actually visible in the tree.
// Builds the LayerList filter predicate from the current text query and the
// "visible only" toggle. Returns null when neither filter is active (clears
// any predicate). Tolerates list items without a layer/title (group nodes,
// tables, runtime layers still loading) and opens matched ancestors so the
// match is actually visible in the tree.
const itemMatches = (item: any, needle: string, index: SearchIndex | null): boolean => {
    const title = (item?.title || item?.layer?.title || '')
    if (title.toLowerCase().includes(needle)) return true
    if (index && item?.layer) {
        const extra = index.get(item.layer)
        if (extra && extra.includes(needle)) return true
    }
    return false
}

const buildFilterPredicate = (searchContent: string, visibleOnly: boolean, index: SearchIndex | null, favorites: Set<string> | null) => {
    const needle = (searchContent || '').toLowerCase()
    if (!needle && !visibleOnly && !favorites) {
        return null
    }
    return (item) => {
        if (!item) {
            return true
        }
        if (favorites) {
            // A group stays when any descendant is a favorite, so the star is reachable.
            const hasFav = (it: any): boolean => {
                if (it?.layer && it.layer.id != null && favorites.has(String(it.layer.id))) return true
                const kids = it?.children ? (it.children.toArray ? it.children.toArray() : it.children) : []
                return kids.some((k: any) => hasFav(k))
            }
            if (!hasFav(item)) return false
            let cur = item
            while (cur) { cur.open = true; cur = cur.parent }
        }
        if (visibleOnly) {
            const isVisible = item?.layer ? item.layer.visible !== false : (item.visible !== false)
            if (!isVisible) {
                return false
            }
        }
        if (needle) {
            const matched = itemMatches(item, needle, index)
            if (matched) {
                let currItem = item
                while (currItem) {
                    currItem.open = true
                    currItem = currItem.parent
                }
            }
            return matched
        }
        return true
    }
}

// Counts list items whose own title matches the search. Walks the full item
// tree — including service sublayers, which are NOT present in map.allLayers —
// so the "N matches" count agrees with what the filter actually shows.
const countMatchingItems = (items: any, needle: string, visibleOnly: boolean, index: SearchIndex | null): number => {
    if (!items || !needle) return 0
    let n = 0
    items.forEach((item: any) => {
        const visible = item?.layer ? item.layer.visible !== false : (item?.visible !== false)
        if ((!visibleOnly || visible) && itemMatches(item, needle, index)) n += 1
        if (item?.children && item.children.length) n += countMatchingItems(item.children, needle, visibleOnly, index)
    })
    return n
}

export default function MapLayersHeader(props: MapLayersHeaderProps) {
    const {
        theme, jimuMapViewId, layerListRef, tableListRef, enableSearch, enableBatchOption,
        isMapWidgetMode, headerKey, expandAllLayers, showLayerCount = false,
        collapsible = false, isCollapsed = false, onToggleCollapse, filterPlaceholder,
        viewFromMapWidget, widgetId, enableLayerViews = false, autoShowParents = true,
        enableAddLayer = false, enableMasterOpacity = false, enableBasemapSwitcher = false,
        enableLegendPanel = false, onHelp, helpLabel, enableShareLink = false, onLinkCopied,
        searchDescriptions = false, enableLayerCsv = false, onCsvExported, presets = [], onApplyPreset,
        enableFavorites = false, enableImagery = false, imageryIndexUrl, onImageryAdded
    } = props

    const translate = hooks.useTranslation(message)

    const [isSearchOpen, setIsSearchOpen] = useState(true)
    const [searchInput, setSearchInput] = useState('')
    const [visibleOnly, setVisibleOnly] = useState(false)
    const [favoritesOnly, setFavoritesOnly] = useState(false)
    // Bumped when a star is toggled so the favorites filter recomputes.
    const [favTick, setFavTick] = useState(0)
    const [counts, setCounts] = useState<{ visible: number, total: number }>({ visible: 0, total: 0 })
    const [matchCount, setMatchCount] = useState<number | null>(null)
    // Short "Link copied" note beside the batch menu, cleared after a moment.
    const [linkNote, setLinkNote] = useState<string>('')
    // Description and tag text per layer for the deep search; null until built.
    const [searchIndex, setSearchIndex] = useState<SearchIndex | null>(null)
    const originalExpandStatesRef = useRef<Map<any, boolean>>(new Map())
    const hadActiveSearchRef = useRef(false)
    // Snapshot of the authored default visibility, captured once per refresh,
    // used by the "Reset to default visibility" batch action.
    const defaultVisibilityRef = useRef<Map<string, boolean>>(new Map())

    const resolveView = useCallback((): any => {
        if (viewFromMapWidget) return viewFromMapWidget
        const jmv = MapViewManager.getInstance().getJimuMapViewById(jimuMapViewId)
        return (jmv?.view as any) || null
    }, [viewFromMapWidget, jimuMapViewId])

    // A layer is "counted" if the user can meaningfully switch it on/off:
    // exclude group layers (they just gate children) and hidden layers.
    const isCountableLayer = (layer: any): boolean => {
        if (!layer) return false
        if (layer.listMode === 'hide') return false
        if (layer.declaredClass === 'esri.layers.GroupLayer') return false
        return typeof layer.visible === 'boolean'
    }

    const computeCounts = useCallback(() => {
        const view = resolveView()
        const allLayers: any = view?.map?.allLayers
        if (!allLayers) {
            return { visible: 0, total: 0 }
        }
        let visible = 0
        let total = 0
        allLayers.forEach((layer: any) => {
            if (!isCountableLayer(layer)) return
            total += 1
            if (layer.visible) visible += 1
        })
        return { visible, total }
    }, [resolveView])

    // Helper to save current expand states
    const saveExpandStates = useCallback((items: any[]) => {
        if (!items) return new Map()
        const states = new Map<any, boolean>()
        const traverse = (itemsList: any[]) => {
            for (const item of itemsList) {
                states.set(item, item.open)
                if (item.children?.length > 0) {
                    traverse(item.children.toArray ? item.children.toArray() : item.children)
                }
            }
        }
        traverse(items)
        return states
    }, [])

    // Helper to restore expand states
    const restoreExpandStates = useCallback((items: any[], states: Map<any, boolean>) => {
        if (!items || !states || states.size === 0) return
        const traverse = (itemsList: any[]) => {
            for (const item of itemsList) {
                if (states.has(item)) {
                    item.open = states.get(item)
                }
                if (item.children?.length > 0) {
                    traverse(item.children.toArray ? item.children.toArray() : item.children)
                }
            }
        }
        traverse(items)
    }, [])

    const onSearchBtnClick = () => {
        // Clear the search input when closing the input box, #29285
        if (isSearchOpen) {
            setSearchInput('')
        }
        setIsSearchOpen(!isSearchOpen)
    }

    const onSearchInputChange = lodash.throttle((event) => {
        const inputStr = event.target.value
        setSearchInput(inputStr)
    }, 200)

    const onTurnAllLayersClickGenerator = useCallback((visible: boolean) => {
        return () => {
            function toggleVisible(jimuLayerViews, visible) {
                for (const layerView of jimuLayerViews) {
                    const layer = layerView.layer
                    layer.visible = visible
                }
            }
            const jimuMapView = MapViewManager.getInstance().getJimuMapViewById(jimuMapViewId)
            toggleVisible(jimuMapView.getAllJimuLayerViews(), visible)
        }
    }, [jimuMapViewId])

    const onExpandAllLayersClickGenerator = useCallback((expand: boolean) => {
        return () => {
            function toggleExpand(items, expand) {
                if (!items) {
                    return
                }
                for (const item of items) {
                    item.open = expand
                    if (item.children) {
                        toggleExpand(item.children, expand)
                    }
                }
            }
            toggleExpand(layerListRef.current.operationalItems, expand)
        }
    }, [layerListRef])

    // Zoom the view to the combined extent of every currently-visible layer.
    const onZoomToVisible = useCallback(() => {
        const view = resolveView()
        const allLayers: any = view?.map?.allLayers
        if (!view || !allLayers) return
        let union: any = null
        allLayers.forEach((layer: any) => {
            if (!isCountableLayer(layer) || !layer.visible) return
            const ext = layer.fullExtent
            if (!ext) return
            union = union ? union.union(ext) : ext.clone()
        })
        if (union) {
            view.goTo(union.expand(1.1)).catch(() => { /* user interrupted */ })
        }
    }, [resolveView])

    // Save the current map view as a PNG image.
    const onExportMapImage = useCallback(() => {
        const view: any = resolveView()
        if (!view || typeof view.takeScreenshot !== 'function') return
        view.takeScreenshot({ format: 'png' }).then((screenshot: any) => {
            if (!screenshot || !screenshot.dataUrl) return
            const a = document.createElement('a')
            a.href = screenshot.dataUrl
            a.download = 'map.png'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
        }).catch((e: any) => { console.error('Export map image failed', e) })
    }, [resolveView])

    useEffect(() => {
        if (!enableFavorites) { setFavoritesOnly(false); return }
        return subscribeFavorites((id: string) => { if (id === widgetId) setFavTick((n: number) => n + 1) })
    }, [enableFavorites, widgetId])

    // Builds the description/tag index once per list refresh when deep search is on.
    useEffect(() => {
        if (!enableSearch || !searchDescriptions) { setSearchIndex(null); return }
        let cancelled = false
        const view = resolveView()
        const allLayers: any = view?.map?.allLayers
        if (!allLayers) return
        buildSearchIndex(allLayers).then((idx: SearchIndex) => { if (!cancelled) setSearchIndex(idx) }).catch(() => { /* search stays name-only */ })
        return () => { cancelled = true }
    }, [enableSearch, searchDescriptions, headerKey, resolveView])

    // Saves every list item (layers, sublayers, groups) to a CSV file.
    const onExportCsv = useCallback(() => {
        const items = layerListRef.current?.operationalItems
        if (!items) return
        try {
            const csv = buildLayerCsv(items, {
                layer: translate('csvLayer'), group: translate('csvGroup'), type: translate('csvType'), on: translate('csvOn'),
                opacity: translate('csvOpacity'), minScale: translate('csvMinScale'), maxScale: translate('csvMaxScale'), url: translate('csvUrl'),
                yes: translate('csvYes'), no: translate('csvNo')
            })
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'map-layers.csv'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
            onCsvExported && onCsvExported()
        } catch (e) { console.error('Export layer list failed', e) }
    }, [layerListRef, translate, onCsvExported])

    // Copies a page address that opens this app with the same layers on (?mlc=ids).
    const onCopyLink = useCallback(() => {
        const view = resolveView()
        const allLayers: any = view?.map?.allLayers
        if (!allLayers) return
        let link = ''
        try { link = buildShareLink(window.location.href, visibleLayerIds(allLayers)) } catch (e) { return }
        const done = () => {
            setLinkNote(translate('linkCopied'))
            window.setTimeout(() => { setLinkNote('') }, 2500)
            onLinkCopied && onLinkCopied()
        }
        const fallback = () => {
            try {
                const ta = document.createElement('textarea')
                ta.value = link
                ta.style.position = 'fixed'
                ta.style.opacity = '0'
                document.body.appendChild(ta)
                ta.select()
                document.execCommand('copy')
                document.body.removeChild(ta)
                done()
            } catch (e) { setLinkNote(translate('linkCopyFailed')) }
        }
        try {
            if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(link).then(done).catch(fallback)
            else fallback()
        } catch (e) { fallback() }
    }, [resolveView, translate, onLinkCopied])

    // Restore each layer to the visibility it had when the list first loaded.
    const onResetVisibility = useCallback(() => {
        const view = resolveView()
        const allLayers: any = view?.map?.allLayers
        const snap = defaultVisibilityRef.current
        if (!allLayers || !snap || snap.size === 0) return
        allLayers.forEach((layer: any) => {
            if (typeof layer?.visible !== 'boolean') return
            if (snap.has(layer.id)) {
                layer.visible = snap.get(layer.id)
            }
        })
    }, [resolveView])

    // Live visibility counter + default-visibility snapshot. Re-binds when the
    // view changes (headerKey) or the map's layer collection changes.
    useEffect(() => {
        if (!showLayerCount && !enableBatchOption) return
        const view = resolveView()
        const allLayers: any = view?.map?.allLayers
        if (!allLayers) return

        const handles: any[] = []

        // Snapshot authored defaults once per refresh.
        if (defaultVisibilityRef.current.size === 0) {
            allLayers.forEach((layer: any) => {
                if (typeof layer?.visible === 'boolean' && layer.id != null) {
                    defaultVisibilityRef.current.set(layer.id, layer.visible)
                }
            })
        }

        const refresh = () => { setCounts(computeCounts()) }

        const bindVisibilityWatchers = () => {
            allLayers.forEach((layer: any) => {
                if (!isCountableLayer(layer)) return
                try {
                    handles.push(layer.watch('visible', refresh))
                } catch (e) { /* not all layers support watch */ }
            })
        }

        bindVisibilityWatchers()
        refresh()

        // Rebind when layers are added/removed at runtime.
        try {
            const collHandle = allLayers.on('change', () => {
                handles.forEach(h => { try { h.remove() } catch (e) { /* noop */ } })
                handles.length = 0
                bindVisibilityWatchers()
                refresh()
            })
            handles.push(collHandle)
        } catch (e) { /* noop */ }

        return () => {
            handles.forEach(h => { try { h.remove() } catch (e) { /* noop */ } })
        }
    }, [showLayerCount, enableBatchOption, headerKey, resolveView, computeCounts])

    useEffect(() => {
        const filterActive = searchInput !== '' || visibleOnly || (enableFavorites && favoritesOnly)

        // No active filter: clear predicate and restore the pre-filter tree state.
        if (!filterActive) {
            layerListRef.current && (layerListRef.current.filterPredicate = null)
            tableListRef.current && (tableListRef.current.filterPredicate = null)
            setMatchCount(null)

            if (hadActiveSearchRef.current && originalExpandStatesRef.current.size > 0) {
                restoreExpandStates(layerListRef.current?.operationalItems?.toArray(), originalExpandStatesRef.current)
                originalExpandStatesRef.current = new Map()
                hadActiveSearchRef.current = false
            }
            return
        }

        // Save expand states before the first filter is applied.
        if (!hadActiveSearchRef.current && layerListRef.current?.operationalItems) {
            originalExpandStatesRef.current = saveExpandStates(layerListRef.current.operationalItems.toArray())
            hadActiveSearchRef.current = true
        }

        const favorites = (enableFavorites && favoritesOnly) ? getFavorites(widgetId) : null
        const predicate = buildFilterPredicate(searchInput, visibleOnly, searchIndex, favorites)
        layerListRef.current && (layerListRef.current.filterPredicate = predicate)
        tableListRef.current && (tableListRef.current.filterPredicate = predicate)

        // Tally matching leaf layers for the live "N matches" hint (text filter only).
        if (searchInput !== '') {
            const needle = searchInput.toLowerCase()
            const n = countMatchingItems(layerListRef.current?.operationalItems, needle, visibleOnly, searchIndex)
            setMatchCount(n)
        } else {
            setMatchCount(null)
        }
    }, [layerListRef, searchInput, visibleOnly, tableListRef, saveExpandStates, restoreExpandStates, resolveView, searchIndex, enableFavorites, favoritesOnly, favTick, widgetId])

    useEffect(() => {
        // Close the search input box when disable searching
        if (!enableSearch) {
            setIsSearchOpen(false)
        }
    }, [enableSearch])

    // Keep the search input box open when the component refreshes
    useEffect(() => {
        setIsSearchOpen(true)
        // A fresh view/list means a fresh default-visibility snapshot.
        defaultVisibilityRef.current = new Map()
    }, [headerKey])

    const showViews = isMapWidgetMode && (enableLayerViews || presets.length > 0)
    if (!enableBatchOption && !enableSearch && !showLayerCount && !collapsible && !showViews && !enableAddLayer && !enableMasterOpacity && !enableBasemapSwitcher && !enableLegendPanel && !onHelp) {
        return null
    }

    const placeholder = (filterPlaceholder && filterPlaceholder.trim()) || translate('filterLayers')
    const countLabel = `${counts.visible} / ${counts.total}`

    return (
        <div className='map-layers-header d-flex justify-content-between align-items-center p-1' css={getStyle(theme)}>
            {
                isSearchOpen && enableSearch ?
                    <TextInput
                        className='map-layers-search-input mr-1'
                        type='text'
                        onChange={onSearchInputChange}
                        autoFocus
                        allowClear
                        placeholder={placeholder}
                    ></TextInput> :
                    <div className='map-layers-header-title d-flex align-items-center'>
                        <span className='ml-2'>{translate('layers')}</span>
                        {showLayerCount &&
                            <Tooltip role='tooltip' title={translate('layersVisibleTooltip')} placement='top'>
                                <span className={`map-layers-count-badge ml-2 ${counts.visible === 0 ? 'is-zero' : ''}`} aria-label={`${countLabel} ${translate('layersVisibleTooltip')}`}>
                                    {countLabel}
                                </span>
                            </Tooltip>
                        }
                    </div>
            }
            <div className='map-layers-header-icons d-flex align-items-center'>
                {linkNote !== '' &&
                    <span className='map-layers-match-count' role='status' aria-live='polite'>{linkNote}</span>
                }
                {(isSearchOpen && enableSearch && matchCount !== null) &&
                    <span className='map-layers-match-count'>
                        {`${matchCount} ${translate('matches')}`}
                    </span>
                }
                {(enableBatchOption && !(isSearchOpen && enableSearch)) &&
                    <Dropdown className='map-layers-batch-action-dropdown' aria-label={translate("batchOptions")}>
                        <DropdownButton color='inherit' icon arrow={false} title={translate("batchOptions")} variant='text'>
                            <SelectOptionOutlined></SelectOptionOutlined>
                        </DropdownButton>
                        <DropdownMenu>
                            {
                                isMapWidgetMode && (
                                    <React.Fragment>
                                        <DropdownItem onClick={onTurnAllLayersClickGenerator(true)}>{translate('turnOnAllLayers')}</DropdownItem>
                                        <DropdownItem onClick={onTurnAllLayersClickGenerator(false)}>{translate('turnOffAllLayers')}</DropdownItem>
                                        <DropdownItem onClick={onResetVisibility}>{translate('resetVisibility')}</DropdownItem>
                                        <DropdownItem onClick={onZoomToVisible}>{translate('zoomToVisible')}</DropdownItem>
                                        <DropdownItem onClick={onExportMapImage}>{translate('exportMapImage')}</DropdownItem>
                                        {enableShareLink && <DropdownItem onClick={onCopyLink}>{translate('copyLayerLink')}</DropdownItem>}
                                        {enableLayerCsv && <DropdownItem onClick={onExportCsv}>{translate('exportLayerCsv')}</DropdownItem>}
                                        <DropdownItem divider></DropdownItem>
                                        <DropdownItem active={visibleOnly} onClick={() => { setVisibleOnly(!visibleOnly) }}>
                                            {visibleOnly ? translate('showAllLayers') : translate('showVisibleOnly')}
                                        </DropdownItem>
                                        {enableFavorites &&
                                            <DropdownItem active={favoritesOnly} onClick={() => { setFavoritesOnly(!favoritesOnly) }}>
                                                {favoritesOnly ? translate('showAllLayers') : translate('showFavoritesOnly')}
                                            </DropdownItem>
                                        }
                                        <DropdownItem divider></DropdownItem>
                                    </React.Fragment>
                                )
                            }
                            <DropdownItem onClick={onExpandAllLayersClickGenerator(true)}>{translate('expandAllLayers')}</DropdownItem>
                            <DropdownItem onClick={onExpandAllLayersClickGenerator(false)}>{translate('collapseAllLayers')}</DropdownItem>
                        </DropdownMenu>
                    </Dropdown>
                }
                {
                    showViews &&
                    <LayerViews
                        theme={theme}
                        widgetId={widgetId}
                        jimuMapViewId={jimuMapViewId}
                        viewFromMapWidget={viewFromMapWidget}
                        autoShowParents={autoShowParents}
                        layerListRef={layerListRef}
                        presets={presets}
                        allowUserViews={enableLayerViews}
                        onApplyPreset={onApplyPreset}
                    />
                }
                {
                    (enableAddLayer && isMapWidgetMode) &&
                    <AddLayer
                        theme={theme}
                        jimuMapViewId={jimuMapViewId}
                        viewFromMapWidget={viewFromMapWidget}
                        enableImagery={enableImagery}
                        imageryIndexUrl={imageryIndexUrl}
                        onImageryAdded={onImageryAdded}
                    />
                }
                {
                    (enableMasterOpacity && isMapWidgetMode) &&
                    <MasterOpacity
                        theme={theme}
                        jimuMapViewId={jimuMapViewId}
                        viewFromMapWidget={viewFromMapWidget}
                    />
                }
                {
                    (enableBasemapSwitcher && isMapWidgetMode) &&
                    <BasemapSwitcher
                        theme={theme}
                        jimuMapViewId={jimuMapViewId}
                        viewFromMapWidget={viewFromMapWidget}
                    />
                }
                {
                    (enableLegendPanel && isMapWidgetMode) &&
                    <LegendPanel
                        theme={theme}
                        jimuMapViewId={jimuMapViewId}
                        viewFromMapWidget={viewFromMapWidget}
                    />
                }
                {
                    enableSearch &&
                    <Tooltip role='tooltip' title={translate('filterLayers')} enterDelay={1000} enterNextDelay={1000} placement='top'>
                        <Button color='inherit' variant='text' className='map-layers-search-btn' icon onClick={onSearchBtnClick} aria-label={translate('filterLayers')}>
                            <FilterOutlined></FilterOutlined>
                        </Button>
                    </Tooltip>
                }
                {
                    collapsible &&
                    <Tooltip role='tooltip' title={isCollapsed ? translate('expandList') : translate('collapseList')} placement='top'>
                        <Button color='inherit' variant='text' className='map-layers-collapse-btn' icon onClick={() => { onToggleCollapse && onToggleCollapse() }} aria-label={isCollapsed ? translate('expandList') : translate('collapseList')} aria-expanded={!isCollapsed}>
                            {isCollapsed ? <DownOutlined></DownOutlined> : <UpOutlined></UpOutlined>}
                        </Button>
                    </Tooltip>
                }
                {
                    onHelp &&
                    <Button size="sm" type="tertiary" icon onClick={onHelp} title={helpLabel} aria-label={helpLabel} style={{ flexShrink: 0 }}>
                        <CalciteIcon icon="question" scale="s" />
                    </Button>
                }
            </div>
        </div>
    )
}
