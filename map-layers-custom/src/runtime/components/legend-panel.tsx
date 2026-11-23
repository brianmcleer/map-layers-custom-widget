/** @jsx jsx */
import { css, hooks, type IMThemeVariables, jsx, React } from 'jimu-core'
import { MapViewManager } from 'jimu-arcgis'
// Registers <arcgis-legend> through Experience Builder's shared bundle (nothing is bundled here).
import 'arcgis-map-components'
import { Button, FloatingPanel, Tooltip } from 'jimu-ui'
import message from '../translations/default'

interface Props {
  theme: IMThemeVariables
  jimuMapViewId: string
  viewFromMapWidget?: any
}

const { useState, useCallback, useRef, useEffect } = React

const getStyle = (theme: IMThemeVariables) => {
  return css`
    display: inline-flex;
    align-items: center;
    .legend-panel-container {
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 0.5rem;
    }
  `
}

const LegendGlyph = () => (
  <svg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
    <rect x='2' y='3' width='3' height='3' fill='currentColor' />
    <rect x='2' y='10' width='3' height='3' fill='currentColor' />
    <path d='M7 4.5h7M7 11.5h7' stroke='currentColor' strokeWidth='1.2' strokeLinecap='round' />
  </svg>
)

export default function LegendPanel (props: Props) {
  const { theme, jimuMapViewId, viewFromMapWidget } = props
  const translate = hooks.useTranslation(message)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<any>(null)

  const resolveView = useCallback((): any => {
    if (viewFromMapWidget) return viewFromMapWidget
    const jmv = MapViewManager.getInstance().getJimuMapViewById(jimuMapViewId)
    return (jmv?.view as any) || null
  }, [viewFromMapWidget, jimuMapViewId])

  // Takes the <arcgis-legend> element out of the panel and destroys it.
  const destroyLegend = useCallback(() => {
    const legend = legendRef.current
    if (!legend) return
    legendRef.current = null
    try { legend.remove() } catch (e) { /* noop */ }
    // destroy() returns a promise on the component
    try { Promise.resolve(legend.destroy?.()).catch((): void => undefined) } catch (e) { /* noop */ }
  }, [])

  // Create/destroy the <arcgis-legend> component alongside the panel. It replaces
  // the Legend widget class, which Esri deprecated in SDK 5.0.
  useEffect(() => {
    let cancelled = false
    if (open && containerRef.current && !legendRef.current) {
      const view = resolveView()
      if (view) {
        customElements.whenDefined('arcgis-legend').then(() => {
          if (cancelled || !containerRef.current || legendRef.current) return
          try {
            const legend: any = document.createElement('arcgis-legend')
            // Set before the element is attached, so it binds to this view
            // instead of looking for a parent <arcgis-map>.
            legend.view = view
            legend.style.display = 'block'
            legend.style.width = '100%'
            containerRef.current.replaceChildren(legend)
            legendRef.current = legend
          } catch (e) {
            console.error('Legend create failed', e)
          }
        }).catch((e: any) => { console.error('Legend component load failed', e) })
      }
    }
    return () => {
      cancelled = true
      if (!open) destroyLegend()
    }
  }, [open, resolveView, destroyLegend])

  // Clean up on unmount.
  useEffect(() => {
    return () => { destroyLegend() }
  }, [destroyLegend])

  const onClose = useCallback(() => { setOpen(false) }, [])

  return (
    <div className='map-layers-legend-panel' css={getStyle(theme)} ref={btnRef}>
      <Tooltip role='tooltip' title={translate('legend')} placement='top'>
        <Button color='inherit' variant='text' icon active={open} aria-label={translate('legend')} aria-pressed={open} onClick={() => { setOpen(!open) }}>
          <LegendGlyph />
        </Button>
      </Tooltip>
      {open &&
        <FloatingPanel
          toggle={(event, type) => { type !== 'clickOutside' && onClose() }}
          headerTitle={translate('legend')}
          reference={btnRef.current}
          open={open}
          className='legend-floating-panel'
          onHeaderClose={onClose}
          dragBounds='body'
          defaultSize={{ width: 340, height: 460 }}
          minSize={{ width: 260, height: 200 }}
          resizeHandles={['bottom-right']}
          resizeHandle={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9a9a', padding: 2 }} aria-hidden='true'>
              <svg width='11' height='11' viewBox='0 0 12 12'>
                <path d='M11 5 L5 11 M11 8.5 L8.5 11' stroke='currentColor' strokeWidth='1.1' strokeLinecap='round' />
              </svg>
            </div>
          }
        >
          <div className='legend-panel-container' ref={containerRef} />
        </FloatingPanel>
      }
    </div>
  )
}
