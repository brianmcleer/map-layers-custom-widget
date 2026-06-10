/** @jsx jsx */
import { React, classNames, css, getAppStore, jsx, utils, polished } from 'jimu-core'
import { FloatingPanel, Slider } from 'jimu-ui'
import type Widget from '../widget'

interface Props {
  widget: Widget
  listItem: any
}

const { useState, useCallback } = React

const getStyle = () => {
  return css`
    .transparency-panel-container {
      width: 320px;
      padding: 1rem;
      .transparency-panel-title {
        display: block;
        -webkit-box-orient: vertical;
        word-break: break-all;
        white-space: normal;
        -webkit-line-clamp: 1;
        font-size: ${polished.rem(14)};
      }
      .transparency-slider {
        padding-bottom: 0.3rem;
        padding-top: 0.4rem;
        margin-top: 1.1rem;
      }
      .transparency-slider-meters {
        span {
          font-size: 5px;
        }
      }
    }
  `
}

const getLocalizedPercentage = (locale: string, percentage: string) => {
  const percentageRevertLocale = ['ar', 'tr']
  return percentageRevertLocale.includes(locale) ? `%${percentage}` : `${percentage}%`
}

export default function TransparencySlider (props: Props) {
  const { widget, listItem } = props
  const [isOpen, setIsOpen] = useState(true)
  const { isRTL, locale } = getAppStore().getState().appContext
  const onHeaderClose = useCallback(() => {
    setIsOpen(false)
    widget.setState({ nativeActionPopper: null })
  }, [widget])
  return (
    <FloatingPanel
      toggle={(event, type) => { type !== 'clickOutside' && onHeaderClose() }}
      headerTitle={widget.translate('transparency')}
      reference={widget.optionBtnRef.current}
      open={isOpen}
      className='transparency-panel'
      onHeaderClose={onHeaderClose}
      css={getStyle()}
      autoSize
    >
      <div className='transparency-panel-container'>
        <span title={listItem.layer.title} className='transparency-panel-title'>{listItem.layer.title}</span>
        <Slider
          className={classNames('transparency-slider', isRTL ? 'rtl' : 'ltr')}
          defaultValue={1 - listItem.layer.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(event) => {
            const transparency = Number.parseFloat(event.target.value)
            listItem.layer.opacity = 1 - transparency
          }}
          tooltip
          formatter={(value) => {
            return utils.formatPercentageNumber((value * 100).toFixed(0) + '%')
          }}
        />
        <div className='d-flex justify-content-center transparency-slider-meters'>
          <span>|</span>
        </div>
        <div className='d-flex justify-content-between transparency-slider-label' dir='ltr'>
          <span style={{ width: '28px', textAlign: 'left' }}>0</span>
          <span>{getLocalizedPercentage(locale, '50')}</span>
          <span>{getLocalizedPercentage(locale, '100')}</span>
        </div>
      </div>
    </FloatingPanel>
  )
}
