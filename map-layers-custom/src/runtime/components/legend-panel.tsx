/** @jsx jsx */
import { css, hooks, type IMThemeVariables, jsx, React } from 'jimu-core'
import { MapViewManager, loadArcGISJSAPIModules } from 'jimu-arcgis'
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

  // Create/destroy the JSAPI Legend widget alongside the panel.
  useEffect(() => {
    let cancelled = false
    if (open && containerRef.current && !legendRef.current) {
      const view = resolveView()
      if (view) {
        loadArcGISJSAPIModules(['esri/widgets/Legend']).then(([Legend]: any[]) => {
          if (cancelled || !containerRef.current) return
          try {
            legendRef.current = new Legend({ view, container: containerRef.current })
          } catch (e) {
            console.error('Legend create failed', e)
          }
        }).catch((e: any) => { console.error('Legend module load failed', e) })
      }
    }
    return () => {
      cancelled = true
      if (!open && legendRef.current) {
        try { legendRef.current.destroy() } catch (e) { /* noop */ }
        legendRef.current = null
      }
    }
  }, [open, resolveView])

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      if (legendRef.current) {
        try { legendRef.current.destroy() } catch (e) { /* noop */ }
        legendRef.current = null
      }
    }
  }, [])

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
