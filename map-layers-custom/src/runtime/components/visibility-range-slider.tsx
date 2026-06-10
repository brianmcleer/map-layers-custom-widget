/** @jsx jsx */
import { type IMThemeVariables, React, css, getAppStore, jsx, polished } from 'jimu-core'
import { FloatingPanel } from 'jimu-ui'
import type Widget from '../widget'
import * as reactiveUtils from 'esri/core/reactiveUtils'
import { useTheme } from 'jimu-theme'

interface Props {
  widget: Widget
  listItem: any
  scaleRangeSliderClass: any
}

const { useState, useCallback, useRef, useEffect } = React

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
        .esri-widget {
          --calcite-button-text-color: var(--sys-color-surface-overlay-text);
          --calcite-dropdown-item-background-color-hover: var(--sys-color-action-hover);
          background-color: unset;
          color: unset;
          font-family: ${theme.sys.typography.body.fontFamily};
          .esri-scale-range-slider__segment-active {
            background: var(--sys-color-action-selected);
          }
        }
      }
    }
  `
}

export default function VisibilityRangeSlider (props: Props) {
  const { widget, listItem, scaleRangeSliderClass } = props
  const [isOpen, setIsOpen] = useState(true)
  const [scaleRangeSlider, setScaleRangeSlider] = useState(null)
  const sliderRef = useRef(null)
  const theme = useTheme()

  useEffect(() => {
    if (!scaleRangeSlider) {
      const locale = getAppStore().getState()?.appContext?.locale
      let scaleRegion: any['region'] = 'US'
      if (locale) {
        // e.g. en-us
        const splits = locale.split('-')
        if (splits?.length > 0) {
          const lastSplit = splits[splits.length - 1]
          if (lastSplit) {
            const region = lastSplit.toUpperCase()
            const validRegions = [
              'AE', 'AR', 'AT', 'AU', 'BE', 'BG', 'BO', 'BR', 'CA', 'CH', 'CI', 'CL', 'CN', 'CO', 'CR', 'CZ', 'DE',
              'DK', 'EE', 'EG', 'ES', 'FI', 'FR', 'GB', 'GL', 'GR', 'GT', 'HK', 'ID', 'IE', 'IL', 'IN', 'IQ', 'IS', 'IT',
              'JP', 'KE', 'KR', 'KW', 'LI', 'LT', 'LU', 'LV', 'MA', 'MG', 'ML', 'MO', 'MX', 'MY', 'NI', 'NL', 'NO', 'NZ',
              'PE', 'PL', 'PR', 'PT', 'RO', 'RU', 'RW', 'SE', 'SG', 'SK', 'SR', 'SV', 'TH', 'TN', 'TW', 'US', 'VE', 'VI', 'ZA'
            ]
            if (validRegions.includes(region)) {
              scaleRegion = region as any
            }
          }
        }
      }

      const SliderClass = scaleRangeSliderClass
      const scaleRangeSlider = new SliderClass({
        view: widget.jmvFromMap.view,
        layer: listItem.layer as any,
        region: scaleRegion,
        container: sliderRef.current
      })
      setScaleRangeSlider(scaleRangeSlider)
      reactiveUtils.watch(() => [scaleRangeSlider.minScale, scaleRangeSlider.maxScale], function ([minScale, maxScale]) {
        (listItem.layer as any).minScale = minScale;
        (listItem.layer as any).maxScale = maxScale
      })
    }
  }, [listItem.layer, scaleRangeSlider, scaleRangeSliderClass, widget.jmvFromMap.view])

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
          <div ref={sliderRef} className='scale-range-slider'></div>
        </div>
      </div>
    </FloatingPanel>
  )
}
