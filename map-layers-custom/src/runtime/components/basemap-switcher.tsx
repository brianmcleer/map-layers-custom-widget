/** @jsx jsx */
import { css, hooks, type IMThemeVariables, jsx, React } from 'jimu-core'
import { MapViewManager, loadArcGISJSAPIModules } from 'jimu-arcgis'
import { Dropdown, DropdownButton, DropdownMenu, DropdownItem, Tooltip } from 'jimu-ui'
import message from '../translations/default'

interface Props {
  theme: IMThemeVariables
  jimuMapViewId: string
  viewFromMapWidget?: any
}

const { useState, useCallback, useEffect, useRef } = React

const getStyle = (theme: IMThemeVariables) => {
  return css`
    display: inline-flex;
    align-items: center;
  `
}

const BasemapGlyph = () => (
  <svg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
    <path d='M2 4.5 8 2l6 2.5L8 7 2 4.5Z' stroke='currentColor' strokeWidth='1.1' fill='none' strokeLinejoin='round' />
    <path d='M2 8l6 2.5L14 8M2 11.5 8 14l6-2.5' stroke='currentColor' strokeWidth='1.1' fill='none' strokeLinejoin='round' />
  </svg>
)

export default function BasemapSwitcher (props: Props) {
  const { theme, jimuMapViewId, viewFromMapWidget } = props
  const translate = hooks.useTranslation(message)
  const [items, setItems] = useState<Array<{ id: string, title: string, basemap: any }>>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const fetched = useRef(false)

  const resolveView = useCallback((): any => {
    if (viewFromMapWidget) return viewFromMapWidget
    const jmv = MapViewManager.getInstance().getJimuMapViewById(jimuMapViewId)
    return (jmv?.view as any) || null
  }, [viewFromMapWidget, jimuMapViewId])

  // Pull the org's configured basemaps from the portal. These are published in
  // the deployment's own spatial reference (e.g. State Plane), so switching to
  // them works regardless of the map's coordinate system — unlike hardcoded
  // Esri basemaps, which are Web Mercator only.
  useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    let cancelled = false
    setStatus('loading')
    loadArcGISJSAPIModules(['esri/portal/Portal'])
      .then(([Portal]: any[]) => {
        const portal = new Portal()
        return portal.load().then(() => portal.fetchBasemaps())
      })
      .then((basemaps: any[]) => {
        // Load each basemap so its title / portalItem is populated; otherwise
        // titles can come back empty and every row reads the same.
        return Promise.all((basemaps || []).map((bm: any) =>
          (bm && bm.load ? bm.load() : Promise.resolve()).catch(() => {})
        )).then(() => basemaps || [])
      })
      .then((basemaps: any[]) => {
        if (cancelled) return
        const list = (basemaps || []).map((bm: any, i: number) => {
          const title = bm.title || (bm.portalItem && bm.portalItem.title) ||
            (bm.baseLayers && bm.baseLayers.length && bm.baseLayers.getItemAt(0).title) ||
            `Basemap ${i + 1}`
          return { id: bm.id || `basemap-${i}`, title, basemap: bm }
        })
        setItems(list)
        setStatus(list.length ? 'ready' : 'error')
      })
      .catch((e: any) => {
        if (cancelled) return
        console.error('Fetch basemaps failed', e)
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [])

  const setBasemap = useCallback((bm: any) => {
    const view = resolveView()
    if (!view || !view.map || !bm) return
    try {
      view.map.basemap = bm
    } catch (e) {
      console.error('Set basemap failed', e)
    }
  }, [resolveView])

  return (
    <div className='map-layers-basemap-switcher' css={getStyle(theme)}>
      <Dropdown aria-label={translate('basemap')}>
        <Tooltip role='tooltip' title={translate('basemap')} placement='top'>
          <DropdownButton color='inherit' icon arrow={false} variant='text'>
            <BasemapGlyph />
          </DropdownButton>
        </Tooltip>
        <DropdownMenu>
          {status === 'loading' &&
            <DropdownItem disabled>{translate('loadingBasemaps')}</DropdownItem>}
          {status === 'error' &&
            <DropdownItem disabled>{translate('noBasemaps')}</DropdownItem>}
          {status === 'ready' && items.map(it => (
            <DropdownItem key={it.id} onClick={() => { setBasemap(it.basemap) }}>{it.title}</DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
    </div>
  )
}
