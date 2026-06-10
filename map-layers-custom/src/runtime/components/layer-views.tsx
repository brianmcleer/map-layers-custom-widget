/** @jsx jsx */
import { css, hooks, type IMThemeVariables, jsx, React } from 'jimu-core'
import { MapViewManager } from 'jimu-arcgis'
import { Button, Dropdown, DropdownButton, DropdownMenu, DropdownItem, TextInput, Tooltip } from 'jimu-ui'
import { TrashOutlined } from 'jimu-icons/outlined/editor/trash'
import message from '../translations/default'

interface SavedViewEntry {
  // Stable path through the layer-list item tree (ids joined by '/').
  path: string
  visible: boolean
  open?: boolean
}

interface SavedView {
  id: string
  name: string
  // New format: array of item-tree entries. Legacy format: { [layerId]: boolean }.
  state: SavedViewEntry[] | { [layerId: string]: boolean }
}

// Stable-ish identifier for a list item: prefer the layer id (string for web
// map layers, numeric for service sublayers), fall back to the title.
const itemIdPart = (item: any): string => {
  const lyr = item && item.layer
  if (lyr && lyr.id != null) return String(lyr.id)
  if (item && item.title) return 't:' + item.title
  return '?'
}

const toArr = (coll: any): any[] => {
  if (!coll) return []
  return coll.toArray ? coll.toArray() : coll
}

// Build a reliable child -> parent map by walking the map's layer tree. Every
// GroupLayer exposes `.layers`; this avoids depending on the unreliable
// `layer.parent` property for nested groups.
const buildParentMap = (map: any): Map<any, any> => {
  const pm = new Map<any, any>()
  const walk = (layers: any, parent: any) => {
    for (const l of toArr(layers)) {
      if (parent) pm.set(l, parent)
      if (l && l.layers) walk(l.layers, l)
    }
  }
  if (map) walk(map.layers, null)
  return pm
}

interface LayerViewsProps {
  theme: IMThemeVariables
  widgetId: string
  jimuMapViewId: string
  viewFromMapWidget?: any
  autoShowParents?: boolean
  layerListRef?: { current: any }
}

const { useState, useCallback, useEffect, useRef } = React

const getStyle = (theme: IMThemeVariables) => {
  return css`
    display: inline-flex;
    align-items: center;
    .lv-save-row {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .lv-save-row .lv-name-input {
      width: 130px;
    }
    .lv-view-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .lv-view-row .lv-view-name {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lv-view-row .lv-delete {
      flex: 0 0 auto;
      opacity: 0.7;
    }
    .lv-view-row .lv-delete:hover {
      opacity: 1;
      color: ${theme.sys.color.error.main};
    }
    .lv-empty {
      font-style: italic;
      opacity: 0.7;
      padding: 4px 12px;
      font-size: var(--calcite-font-size--2);
    }
  `
}

// A small bookmark glyph rendered inline so the component has no dependency on
// any particular jimu-icons path (icon module names vary between releases).
const BookmarkGlyph = () => (
  <svg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
    <path d='M4 2.5h8a.5.5 0 0 1 .5.5v10.2a.3.3 0 0 1-.46.25L8 11.1l-4.04 2.35a.3.3 0 0 1-.46-.25V3a.5.5 0 0 1 .5-.5Z' stroke='currentColor' strokeWidth='1.1' fill='none' />
  </svg>
)

export default function LayerViews (props: LayerViewsProps) {
  const { theme, widgetId, jimuMapViewId, viewFromMapWidget, autoShowParents = true, layerListRef } = props
  const translate = hooks.useTranslation(message)

  const [views, setViews] = useState<SavedView[]>([])
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')

  // Keyed by widget id only. Earlier builds also keyed by jimuMapViewId, which
  // can differ between the builder and the published app (and across some
  // reloads), so saved views appeared to "not be remembered". Keying by widget
  // id keeps them stable. A one-time migration below pulls in any views that
  // were stored under the old per-view key.
  const storageKey = `exb-maplayers-views::${widgetId}`
  const legacyKey = `exb-maplayers-views::${widgetId}::${jimuMapViewId}`
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resolveView = useCallback((): any => {
    if (viewFromMapWidget) return viewFromMapWidget
    const jmv = MapViewManager.getInstance().getJimuMapViewById(jimuMapViewId)
    return (jmv?.view as any) || null
  }, [viewFromMapWidget, jimuMapViewId])

  const persist = useCallback((next: SavedView[]) => {
    setViews(next)
    try {
      window?.localStorage?.setItem(storageKey, JSON.stringify(next))
    } catch (e) { /* storage may be unavailable; views still work this session */ }
  }, [storageKey])

  // Load persisted views for this widget on mount (and when the key changes),
  // migrating any views saved under the old per-view key from earlier builds.
  useEffect(() => {
    try {
      const raw = window?.localStorage?.getItem(storageKey)
      let loaded: SavedView[] = raw ? JSON.parse(raw) : []

      // One-time migration from the legacy widget+view key.
      if (legacyKey !== storageKey) {
        const legacyRaw = window?.localStorage?.getItem(legacyKey)
        if (legacyRaw) {
          const legacyViews: SavedView[] = JSON.parse(legacyRaw)
          if (Array.isArray(legacyViews) && legacyViews.length > 0) {
            const existingIds = new Set(loaded.map(v => v.id))
            const merged = [...loaded, ...legacyViews.filter(v => v && !existingIds.has(v.id))]
            loaded = merged
            window?.localStorage?.setItem(storageKey, JSON.stringify(merged))
          }
          window?.localStorage?.removeItem(legacyKey)
        }
      }
      setViews(Array.isArray(loaded) ? loaded : [])
    } catch (e) {
      setViews([])
    }
  }, [storageKey, legacyKey])

  // Capture visibility + expansion straight from the layer-list item tree, so
  // it covers group layers, nested groups, and map-service sublayers (exactly
  // the rows the user toggles). Keyed by an id-path so nesting is unambiguous.
  const captureCurrentState = useCallback((): SavedViewEntry[] => {
    const entries: SavedViewEntry[] = []
    const list: any = layerListRef && layerListRef.current
    if (list && list.operationalItems) {
      const walk = (items: any, prefix: string) => {
        for (const item of toArr(items)) {
          const key = prefix + '/' + itemIdPart(item)
          entries.push({ path: key, visible: item.visible !== false, open: !!item.open })
          if (item.children && item.children.length > 0) walk(item.children, key)
        }
      }
      walk(list.operationalItems, '')
    }
    // Fallback if the list is not ready: flat capture from all layers.
    if (entries.length === 0) {
      const view = resolveView()
      const allLayers: any = view?.map?.allLayers
      if (allLayers) {
        allLayers.forEach((layer: any) => {
          if (layer && layer.id != null && typeof layer.visible === 'boolean') {
            entries.push({ path: '/' + layer.id, visible: layer.visible })
          }
        })
      }
    }
    return entries
  }, [layerListRef, resolveView])

  // Apply the new item-tree format. Sets each item's visibility, then for every
  // item that should be visible forces its ancestor groups visible AND open
  // (both via the list-item tree, and via a reliable parent map so hidden
  // container groups are turned on too). Re-runs a few times to survive the
  // list re-rendering after visibility changes.
  const applyEntries = useCallback((entries: SavedViewEntry[]) => {
    const list: any = layerListRef && layerListRef.current
    if (!list || !list.operationalItems) return
    const v = resolveView()
    const map: any = v?.map
    const byPath = new Map<string, SavedViewEntry>()
    entries.forEach(e => { if (e && e.path) byPath.set(e.path, e) })

    const pass = () => {
      const parentMap = (autoShowParents !== false && map) ? buildParentMap(map) : null

      // 1) Set visibility top-down.
      const walkSet = (items: any, prefix: string) => {
        for (const item of toArr(items)) {
          const key = prefix + '/' + itemIdPart(item)
          const e = byPath.get(key)
          if (e && typeof item.visible === 'boolean') item.visible = e.visible
          if (item.children && item.children.length > 0) walkSet(item.children, key)
        }
      }
      walkSet(list.operationalItems, '')

      // 2) Reveal everything that should be visible.
      const walkReveal = (items: any, prefix: string, ancestors: any[]) => {
        for (const item of toArr(items)) {
          const key = prefix + '/' + itemIdPart(item)
          const e = byPath.get(key)
          if (e && e.visible) {
            if (autoShowParents !== false) {
              for (const a of ancestors) {
                a.open = true
                if (typeof a.visible === 'boolean') a.visible = true
              }
              // Also turn on any hidden container groups not present as items.
              if (parentMap && item.layer) {
                let p = parentMap.get(item.layer)
                while (p) {
                  if (typeof p.visible === 'boolean' && p.visible !== true) p.visible = true
                  p = parentMap.get(p)
                }
              }
            }
            if (item.children && item.children.length > 0) {
              item.open = e.open !== undefined ? e.open : true
            }
          } else if (e && item.children && item.children.length > 0) {
            item.open = !!e.open
          }
          if (item.children && item.children.length > 0) {
            walkReveal(item.children, key, ancestors.concat(item))
          }
        }
      }
      walkReveal(list.operationalItems, '', [])
    }

    pass()
    setTimeout(pass, 120)
    setTimeout(pass, 350)
  }, [layerListRef, resolveView, autoShowParents])

  // Best-effort apply for legacy { [layerId]: boolean } views (saved by builds
  // before the tree format). Uses the reliable parent map for ancestor walking.
  const applyLegacy = useCallback((state: { [layerId: string]: boolean }) => {
    const v = resolveView()
    const map: any = v?.map
    const allLayers: any = map?.allLayers
    if (!allLayers) return
    allLayers.forEach((layer: any) => {
      if (layer && layer.id != null && typeof layer.visible === 'boolean' && Object.prototype.hasOwnProperty.call(state, layer.id)) {
        layer.visible = state[layer.id]
      }
    })
    if (autoShowParents !== false) {
      const parentMap = buildParentMap(map)
      allLayers.forEach((layer: any) => {
        if (layer && layer.id != null && state[layer.id] === true) {
          let p = parentMap.get(layer)
          while (p) {
            if (typeof p.visible === 'boolean' && p.visible !== true) p.visible = true
            p = parentMap.get(p)
          }
        }
      })
    }
    const openAncestors = () => {
      const list: any = layerListRef && layerListRef.current
      if (!list || !list.operationalItems) return
      const walk = (items: any) => {
        for (const item of toArr(items)) {
          const lid = item?.layer?.id
          if (lid != null && state[lid] === true) {
            let p: any = item.parent
            while (p) { p.open = true; p = p.parent }
            if (item.children && item.children.length > 0) item.open = true
          }
          if (item.children && item.children.length > 0) walk(item.children)
        }
      }
      walk(list.operationalItems)
    }
    openAncestors()
    setTimeout(openAncestors, 120)
    setTimeout(openAncestors, 350)
  }, [resolveView, autoShowParents, layerListRef])

  const applyView = useCallback((view: SavedView) => {
    if (!view || !view.state) return
    if (Array.isArray(view.state)) {
      applyEntries(view.state)
    } else {
      applyLegacy(view.state as { [layerId: string]: boolean })
    }
  }, [applyEntries, applyLegacy])

  const beginSave = () => {
    setNewName(`${translate('viewDefaultName')} ${views.length + 1}`)
    setSaving(true)
  }

  const commitSave = () => {
    const name = (newName || '').trim() || `${translate('viewDefaultName')} ${views.length + 1}`
    const next: SavedView[] = [
      ...views,
      { id: `view-${Date.now()}`, name, state: captureCurrentState() }
    ]
    persist(next)
    setSaving(false)
    setNewName('')
  }

  const cancelSave = () => {
    setSaving(false)
    setNewName('')
  }

  const deleteView = (id: string, evt?: any) => {
    if (evt) { evt.stopPropagation() }
    persist(views.filter(v => v.id !== id))
  }

  // Download the current saved views as a JSON file so they can be backed up
  // or shared with other users / machines (views otherwise live only in this
  // browser's local storage).
  const exportViews = () => {
    try {
      const payload = JSON.stringify({ type: 'map-layers-views', version: 1, views }, null, 2)
      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `map-layers-views-${widgetId}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export views failed', e)
    }
  }

  const triggerImport = () => {
    fileInputRef.current && fileInputRef.current.click()
  }

  // Read a previously-exported JSON file and merge its views into the current
  // set. Ids are regenerated to avoid clobbering existing views.
  const onImportFile = (evt: any) => {
    const file = evt?.target?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const incoming = Array.isArray(parsed) ? parsed : parsed?.views
        if (Array.isArray(incoming)) {
          const cleaned: SavedView[] = incoming
            .filter((v: any) => v && v.name && v.state && typeof v.state === 'object')
            .map((v: any, i: number) => ({
              id: `view-${Date.now()}-${i}`,
              name: String(v.name),
              state: v.state
            }))
          if (cleaned.length > 0) {
            persist([...views, ...cleaned])
          }
        }
      } catch (e) {
        console.error('Import views failed', e)
      }
    }
    reader.readAsText(file)
    // Reset so importing the same file again still fires onChange.
    evt.target.value = ''
  }

  if (saving) {
    return (
      <div className='map-layers-views' css={getStyle(theme)}>
        <div className='lv-save-row'>
          <TextInput
            className='lv-name-input'
            size='sm'
            autoFocus
            value={newName}
            onChange={(e) => { setNewName(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSave()
              if (e.key === 'Escape') cancelSave()
            }}
            placeholder={translate('viewNamePlaceholder')}
          />
          <Button size='sm' type='primary' onClick={commitSave}>{translate('save')}</Button>
          <Button size='sm' type='tertiary' onClick={cancelSave}>{translate('cancel')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className='map-layers-views' css={getStyle(theme)}>
      <Dropdown aria-label={translate('savedViews')}>
        <Tooltip role='tooltip' title={translate('savedViews')} placement='top'>
          <DropdownButton color='inherit' icon arrow={false} variant='text' aria-label={translate('savedViews')}>
            <BookmarkGlyph />
          </DropdownButton>
        </Tooltip>
        <DropdownMenu>
          <DropdownItem onClick={beginSave}>{translate('saveCurrentView')}</DropdownItem>
          <DropdownItem divider></DropdownItem>
          {views.length === 0 &&
            <div className='lv-empty'>{translate('noSavedViews')}</div>
          }
          {views.map(view => (
            <DropdownItem key={view.id} onClick={() => { applyView(view) }} title={`${translate('applyView')}: ${view.name}`}>
              <div className='lv-view-row'>
                <span className='lv-view-name'>{view.name}</span>
                <Button
                  className='lv-delete'
                  size='sm'
                  icon
                  type='tertiary'
                  aria-label={`${translate('deleteView')}: ${view.name}`}
                  onClick={(e) => { deleteView(view.id, e) }}
                >
                  <TrashOutlined size='s' />
                </Button>
              </div>
            </DropdownItem>
          ))}
          <DropdownItem divider></DropdownItem>
          {views.length > 0 &&
            <DropdownItem onClick={exportViews}>{translate('exportViews')}</DropdownItem>
          }
          <DropdownItem onClick={triggerImport}>{translate('importViews')}</DropdownItem>
        </DropdownMenu>
      </Dropdown>
      <input
        ref={fileInputRef}
        type='file'
        accept='application/json,.json'
        style={{ display: 'none' }}
        onChange={onImportFile}
      />
    </div>
  )
}
