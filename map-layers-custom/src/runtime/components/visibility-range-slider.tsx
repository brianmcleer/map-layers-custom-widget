/** @jsx jsx */
import { type IMThemeVariables, React, css, getAppStore, jsx, polished } from 'jimu-core'
import { FloatingPanel } from 'jimu-ui'
import type Widget from '../widget'
// Registers <arcgis-scale-range-slider> through Experience Builder's shared bundle (nothing is bundled here).
import 'arcgis-map-components'
import { useTheme } from 'jimu-theme'
import { hooks as __exbI18nHooks } from 'jimu-core';
import __exbI18nMessages from '../translations/default';


interface Props {
  widget: Widget
  listItem: any
}

const { useState, useCallback, useRef, useEffect } = React

const VALID_REGIONS = [
  'AE', 'AR', 'AT', 'AU', 'BE', 'BG', 'BO', 'BR', 'CA', 'CH', 'CI', 'CL', 'CN', 'CO', 'CR', 'CZ', 'DE',
  'DK', 'EE', 'EG', 'ES', 'FI', 'FR', 'GB', 'GL', 'GR', 'GT', 'HK', 'ID', 'IE', 'IL', 'IN', 'IQ', 'IS', 'IT',
  'JP', 'KE', 'KR', 'KW', 'LI', 'LT', 'LU', 'LV', 'MA', 'MG', 'ML', 'MO', 'MX', 'MY', 'NI', 'NL', 'NO', 'NZ',
  'PE', 'PL', 'PR', 'PT', 'RO', 'RU', 'RW', 'SE', 'SG', 'SK', 'SR', 'SV', 'TH', 'TN', 'TW', 'US', 'VE', 'VI', 'ZA'
]

// Region for the slider's scale names, from the app locale (e.g. en-us -> US).
const regionFromLocale = (locale: string | undefined): string => {
  const region = locale?.split('-')?.pop()?.toUpperCase()
  return region && VALID_REGIONS.includes(region) ? region : 'US'
}

const getStyle = (theme: IMThemeVariables) => {
  return css`
    .visibility-range-container {
      min-width: 342px;
      .visibility-range-panel-title {
        display: block;
        -webkit-box-orient: vertical;
        word-break: break-all;
        white-space: normal;
        -webkit-line-clamp: 1;
        font-size: ${polished.rem(14)};
        padding: 1rem 1rem 0 1rem;
      }
      .scale-range-slider-container {
        padding: 1rem;
        arcgis-scale-range-slider {
          --calcite-button-text-color: var(--sys-color-surface-overlay-text);
          --calcite-dropdown-item-background-color-hover: var(--sys-color-action-hover);
          --arcgis-scale-range-slider-segment-color: var(--sys-color-action-selected);
          display: block;
          background-color: unset;
          color: unset;
          font-family: ${theme.sys.typography.body.fontFamily};
        }
      }
    }
  `
}

export default function VisibilityRangeSlider (props: Props) {
  const t = __exbI18nHooks.useTranslation(__exbI18nMessages);
  const { widget, listItem } = props
  const [isOpen, setIsOpen] = useState(true)
  const sliderRef = useRef<HTMLDivElement>(null)
  const theme = useTheme()

  // <arcgis-scale-range-slider> in place of the ScaleRangeSlider widget class
  // (deprecated in SDK 5.0).
  useEffect(() => {
    const host = sliderRef.current
    if (!host) return
    const slider: any = document.createElement('arcgis-scale-range-slider')
    slider.className = 'scale-range-slider'
    slider.view = widget.jmvFromMap.view
    slider.layer = listItem.layer
    slider.region = regionFromLocale(getAppStore().getState()?.appContext?.locale)

    const onPropertyChange = (evt: any) => {
      const name = evt.detail?.name
      if (name === 'minScale' || name === 'maxScale') {
        const layer = listItem.layer as any
        layer.minScale = slider.minScale
        layer.maxScale = slider.maxScale
      }
    }
    slider.addEventListener('arcgisPropertyChange', onPropertyChange)
    host.replaceChildren(slider)

    return () => {
      slider.removeEventListener('arcgisPropertyChange', onPropertyChange)
      slider.remove()
      // destroy() returns a promise on the component
      try { Promise.resolve(slider.destroy?.()).catch((): void => undefined) } catch (e) { /* noop */ }
    }
  }, [listItem.layer, widget.jmvFromMap.view])

  const onHeaderClose = useCallback(() => {
    setIsOpen(false)
    widget.setState({ nativeActionPopper: null })
  }, [widget])

  return (
    <FloatingPanel
      toggle={(event, type) => { type !== 'clickOutside' && onHeaderClose() }}
      headerTitle={widget.translate('visibilityRange')}
      reference={widget.optionBtnRef.current}
      open={isOpen}
      className='visibility-range-panel'
      autoSize
      onHeaderClose={onHeaderClose}
      css={getStyle(theme)}
    >
      <div className='visibility-range-container'>
        <span title={listItem.layer.title} className='visibility-range-panel-title'>{listItem.layer.title}</span>
        <div className='scale-range-slider-container'>
          <div ref={sliderRef}></div>
        </div>
      </div>
    </FloatingPanel>
  )
}
