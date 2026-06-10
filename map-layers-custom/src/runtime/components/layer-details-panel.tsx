/** @jsx jsx */
import { React, css, hooks, jsx, polished } from 'jimu-core'
import { FloatingPanel } from 'jimu-ui'
import type { Widget } from '../widget'
import message from '../translations/default'

interface Props {
  widget: Widget
  listItem: any
}

const { useState, useEffect, useCallback } = React

const getStyle = () => {
  return css`
    .layer-details-container {
      width: 320px;
      max-width: 86vw;
      padding: 0.75rem 1rem 1rem;
    }
    .ld-title {
      display: block;
      font-size: ${polished.rem(14)};
      font-weight: 600;
      margin-bottom: 0.5rem;
      word-break: break-word;
    }
    .ld-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 0;
      border-bottom: 1px solid var(--sys-color-divider-secondary);
      font-size: ${polished.rem(12)};
    }
    .ld-row:last-child { border-bottom: none; }
    .ld-label { color: var(--ref-palette-neutral-900); flex: 0 0 auto; }
    .ld-value {
      text-align: right;
      word-break: break-word;
      font-weight: 500;
    }
    .ld-value a { color: var(--sys-color-primary-main); }
  `
}

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export default function LayerDetailsPanel (props: Props) {
  const { widget, listItem } = props
  const translate = hooks.useTranslation(message)
  const [isOpen, setIsOpen] = useState(true)
  const [featureCount, setFeatureCount] = useState<string>('—')

  const layer: any = listItem.layer

  const onClose = useCallback(() => {
    setIsOpen(false)
    widget.setState({ nativeActionPopper: null })
  }, [widget])

  // Live feature count for feature-like layers.
  useEffect(() => {
    let cancelled = false
    const canCount = layer && typeof layer.queryFeatureCount === 'function'
    if (!canCount) {
      setFeatureCount('—')
      return
    }
    setFeatureCount(translate('detailCounting'))
    layer.queryFeatureCount()
      .then((count: number) => { if (!cancelled) setFeatureCount(Number(count).toLocaleString()) })
      .catch(() => { if (!cancelled) setFeatureCount('—') })
    return () => { cancelled = true }
  }, [layer, translate])

  const sourceUrl = layer && layer.url
    ? ((layer.type === 'feature' && layer.layerId != null) ? `${layer.url}/${layer.layerId}` : layer.url)
    : null

  const rows: Array<{ label: string, value: any }> = []
  rows.push({ label: translate('detailType'), value: layer?.type ? titleCase(String(layer.type)) : '—' })
  if (layer?.geometryType) rows.push({ label: translate('detailGeometry'), value: titleCase(String(layer.geometryType)) })
  rows.push({ label: translate('detailFeatures'), value: featureCount })
  if (layer?.fields && layer.fields.length != null) rows.push({ label: translate('detailFields'), value: String(layer.fields.length) })
  rows.push({ label: translate('detailOpacity'), value: `${Math.round((layer?.opacity != null ? layer.opacity : 1) * 100)}%` })
  if (layer?.spatialReference?.wkid) rows.push({ label: translate('detailSpatialRef'), value: `WKID ${layer.spatialReference.wkid}` })
  const minS = layer?.minScale
  const maxS = layer?.maxScale
  if (minS || maxS) {
    const fmt = (n: number) => n ? `1:${Number(n).toLocaleString()}` : translate('detailNoLimit')
    rows.push({ label: translate('detailScale'), value: `${fmt(maxS)} – ${fmt(minS)}` })
  }

  return (
    <FloatingPanel
      toggle={(event, type) => { type !== 'clickOutside' && onClose() }}
      headerTitle={translate('layerDetails')}
      reference={widget.optionBtnRef.current}
      open={isOpen}
      className='layer-details-panel'
      onHeaderClose={onClose}
      css={getStyle()}
      autoSize
    >
      <div className='layer-details-container'>
        <span className='ld-title' title={layer?.title}>{layer?.title || '—'}</span>
        {rows.map((r, i) => (
          <div className='ld-row' key={i}>
            <span className='ld-label'>{r.label}</span>
            <span className='ld-value'>{r.value}</span>
          </div>
        ))}
        {sourceUrl &&
          <div className='ld-row'>
            <span className='ld-label'>{translate('detailSource')}</span>
            <span className='ld-value'>
              <a href={sourceUrl} target='_blank' rel='noopener noreferrer'>{translate('detailOpenService')}</a>
            </span>
          </div>
        }
      </div>
    </FloatingPanel>
  )
}
