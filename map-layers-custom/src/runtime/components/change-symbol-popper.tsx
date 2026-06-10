/** @jsx jsx */
import { ExBAddedJSAPIProperties, React, css, jsx, polished } from 'jimu-core'
import { FloatingPanel, Label, Radio } from 'jimu-ui'
import type Widget from '../widget'
import { JimuSymbolType, SymbolList } from 'jimu-ui/advanced/map'

interface Props {
  widget: Widget
  listItem: any
  symbolType: JimuSymbolType
}

const { useState, useCallback } = React

const getStyle = (symbolType) => {
  return css`
    .change-symbol-container {
      width: 320px;
      .change-symbol-title {
        display: block;
        -webkit-box-orient: vertical;
        word-break: break-all;
        white-space: normal;
        -webkit-line-clamp: 1;
        font-size: ${polished.rem(14)};
        padding: 1rem 1rem 0 1rem;
      }
      .change-symbol-options {
        margin-left: 1rem;
        margin-top: 0.5rem;
        .radio-option {
          margin-right: 0.25rem;
        }
      }
      .symbol-list-container {
        min-height: ${symbolType === JimuSymbolType.Point ? '294px' : '238px'};
      }
    }
  `
}

export default function ChangeSymbolPopper(props: Props) {
  const { widget, listItem, symbolType } = props
  const [symbolOption, setSymbolOption] = useState(
    listItem.layer[ExBAddedJSAPIProperties.EXB_PREDEFINED_RENDERER] ? 'custom' : 'predefined'
  )
  const [isOpen, setIsOpen] = useState(true)
  const [hasPredefinedRender, setHasPredefinedRenderer] = useState(!!listItem.layer[ExBAddedJSAPIProperties.EXB_PREDEFINED_RENDERER])

  const onHeaderClose = useCallback(() => {
    setIsOpen(false)
    widget.setState({ nativeActionPopper: null })
  }, [widget])

  const onSymbolOptionChange = useCallback(
    (event) => {
      if (!widget.state.jimuMapViewId) {
        return
      }
      // predefined / custom
      setSymbolOption(event.target.value)
      if (event.target.value === 'predefined' && listItem.layer[ExBAddedJSAPIProperties.EXB_PREDEFINED_RENDERER]) {
        listItem.layer.renderer = listItem.layer[ExBAddedJSAPIProperties.EXB_PREDEFINED_RENDERER]
        delete listItem.layer[ExBAddedJSAPIProperties.EXB_PREDEFINED_RENDERER]
        setHasPredefinedRenderer(false)
      }
    },
    [listItem.layer, widget]
  )

  const onSymbolChange = useCallback(
    (symbol) => {
      if (!listItem.layer[ExBAddedJSAPIProperties.EXB_PREDEFINED_RENDERER]) {
        listItem.layer[ExBAddedJSAPIProperties.EXB_PREDEFINED_RENDERER] = listItem.layer.renderer
      }
      setHasPredefinedRenderer(true)
      listItem.layer.renderer = {
        type: 'simple',
        symbol: symbol
      }
    },
    [listItem.layer]
  )

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const onA11yFocus = () => { }

  return (
    <FloatingPanel
      toggle={(event, type) => {
        type !== 'clickOutside' && onHeaderClose()
      }}
      headerTitle={widget.translate('changeSymbol')}
      reference={widget.optionBtnRef.current}
      open={isOpen}
      className='change-symbol-popper-panel'
      onHeaderClose={onHeaderClose}
      css={getStyle(symbolType)}
      autoSize
      shiftOptions={{
        crossAxis: true
      }}
    >
      <div className='change-symbol-container pb-2'>
        <span title={listItem.layer.title} className='change-symbol-title'>
          {listItem.layer.title}
        </span>
        <div className='change-symbol-options' role='radiogroup'>
          <Label
            className='d-flex align-items-center'
            style={{ cursor: 'pointer', fontWeight: 'normal' }}
          >
            <Radio
              className='radio-option'
              name='predefined'
              value='predefined'
              onChange={onSymbolOptionChange}
              checked={symbolOption === 'predefined'}
            ></Radio>
            {widget.translate('usePredefinedSymbols')}
          </Label>
          <Label
            className='d-flex align-items-center'
            style={{ cursor: 'pointer', fontWeight: 'normal' }}
          >
            <Radio
              className='radio-option'
              name='custom'
              value='custom'
              onChange={onSymbolOptionChange}
              checked={symbolOption === 'custom'}
            ></Radio>
            {widget.translate('useCustomSymbols')}
          </Label>
        </div>
        {symbolOption === 'custom' && (
          <React.Fragment>
            <div className='px-4 pt-2 pb-1 align-items-center' style={{ display: hasPredefinedRender ? 'none' : 'flex', height: '40px' }}>
              <div>{widget.translate('preview')}</div>
            </div>
            <SymbolList
              symbol={hasPredefinedRender ? listItem.layer.renderer?.symbol : null}
              className='symbol-list-container'
              isShow
              onA11yFocus={onA11yFocus}
              jimuSymbolType={symbolType}
              onPointSymbolChanged={onSymbolChange}
              onPolylineSymbolChanged={onSymbolChange}
              onPolygonSymbolChanged={onSymbolChange}
              showSymbolPreview={hasPredefinedRender}
            ></SymbolList>
          </React.Fragment>
        )}
      </div>
    </FloatingPanel>
  )
}
