/** @jsx jsx */
import { css, hooks, type IMThemeVariables, jsx, React } from 'jimu-core'
import { MapViewManager } from 'jimu-arcgis'
import { Button, Slider, Tooltip, Popper } from 'jimu-ui'
import message from '../translations/default'

interface Props {
  theme: IMThemeVariables
  jimuMapViewId: string
  viewFromMapWidget?: any
}

const { useState, useCallback, useRef } = React

const getStyle = (theme: IMThemeVariables) => {
  return css`
    display: inline-flex;
    align-items: center;
  `
}

const getPopoverStyle = (theme: IMThemeVariables) => {
  return css`
    width: 248px;
    padding: 14px 16px;
    background: ${theme?.ref?.palette?.white || '#fff'};
    .mo-title { font-size: var(--calcite-font-size-0, 14px); font-weight: 600; margin-bottom: 4px; color: ${theme?.ref?.palette?.neutral?.[1100] || '#1a1a1a'}; }
    .mo-hint { font-size: var(--calcite-font-size--2, 12px); color: ${theme?.ref?.palette?.neutral?.[800] || '#6a6a6a'}; margin-bottom: 12px; line-height: 1.4; }
    .mo-row { display: flex; align-items: center; gap: 10px; }
    .mo-slider { flex: 1 1 auto; }
    .mo-val { font-size: var(--calcite-font-size--1, 13px); width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
  `
}

const OpacityGlyph = () => (
  <svg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
    <circle cx='8' cy='8' r='6' stroke='currentColor' strokeWidth='1.2' fill='none' />
    <path d='M8 2a6 6 0 0 0 0 12z' fill='currentColor' />
  </svg>
)

export default function MasterOpacity (props: Props) {
  const { theme, jimuMapViewId, viewFromMapWidget } = props
  const translate = hooks.useTranslation(message)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(1)
  const anchorRef = useRef<HTMLSpanElement>(null)

  const resolveView = useCallback((): any => {
    if (viewFromMapWidget) return viewFromMapWidget
    const jmv = MapViewManager.getInstance().getJimuMapViewById(jimuMapViewId)
    return (jmv?.view as any) || null
  }, [viewFromMapWidget, jimuMapViewId])

  const applyOpacity = useCallback((v: number) => {
    const view = resolveView()
    const allLayers: any = view?.map?.allLayers
    if (!allLayers) return
    allLayers.forEach((layer: any) => {
      if (layer && typeof layer.opacity === 'number' && layer.declaredClass !== 'esri.layers.GroupLayer') {
        layer.opacity = v
      }
    })
  }, [resolveView])

  return (
    <div className='map-layers-master-opacity' css={getStyle(theme)}>
      <span ref={anchorRef} style={{ display: 'inline-flex' }}>
        <Tooltip role='tooltip' title={translate('masterOpacity')} placement='top'>
          <Button
            color='inherit'
            variant='text'
            icon
            aria-label={translate('masterOpacity')}
            aria-haspopup='true'
            aria-expanded={open}
            onClick={() => { setOpen(o => !o) }}
          >
            <OpacityGlyph />
          </Button>
        </Tooltip>
      </span>
      <Popper
        open={open}
        reference={anchorRef.current}
        toggle={() => { setOpen(false) }}
        placement='bottom-end'
      >
        <div css={getPopoverStyle(theme)}>
          <div className='mo-title'>{translate('masterOpacity')}</div>
          <div className='mo-hint'>{translate('masterOpacityHint')}</div>
          <div className='mo-row'>
            <Slider
              className='mo-slider'
              aria-label={translate('masterOpacity')}
              value={value}
              min={0}
              max={1}
              step={0.05}
              onChange={(e) => {
                const v = Number.parseFloat((e.target as HTMLInputElement).value)
                setValue(v)
                applyOpacity(v)
              }}
            />
            <span className='mo-val'>{Math.round(value * 100)}%</span>
          </div>
        </div>
      </Popper>
    </div>
  )
}
