import { ExBAddedJSAPIProperties, React, SupportedJSAPILayerTypes } from 'jimu-core'
import Action from './action'
import type { Widget } from '../widget'
import ChangeSymbolPopper from '../components/change-symbol-popper'
import { JimuSymbolType } from 'jimu-ui/advanced/map'
import { ChangeSymbolOutlined } from 'jimu-icons/outlined/editor/change-symbol'
import { ACTION_INDEXES } from './constants'

export default class ChangeSymbol extends Action {
  constructor(widget: Widget, title: string) {
    super()
    this.id = 'change-symbol'
    this.title = title
    this.className = 'esri-icon-edit'
    this.group = ACTION_INDEXES.ChangeSymbol
    this.widget = widget
    this.icon = <ChangeSymbolOutlined />
  }

  isValid = (listItem, isTableList): boolean => {
    if (isTableList) {
      return false
    }
    const supportedTypes = [
      SupportedJSAPILayerTypes.FeatureLayer,
      SupportedJSAPILayerTypes.OrientedImageryLayer,
      SupportedJSAPILayerTypes.MapImageLayer,
      SupportedJSAPILayerTypes.CSVLayer,
      SupportedJSAPILayerTypes.GeoJSONLayer,
      SupportedJSAPILayerTypes.SubtypeSublayer,
      'sublayer'
    ]
    if (!supportedTypes.includes(listItem.layer.type)) {
      return false
    }
    // For map-image layers
    if (listItem.layer.type === 'sublayer' && !this.supportDynamicLayers(listItem)) {
      return false
    }
    if (
      this.useMapWidget() &&
      this.widget.props.config.changeSymbolForRuntimeLayers
    ) {
      const supportedGeometryTypes = ['point', 'polyline', 'polygon']
      const layer = listItem.layer
      return layer[ExBAddedJSAPIProperties.EXB_LAYER_FROM_RUNTIME] && supportedGeometryTypes.includes((layer).geometryType)
    }
    return false
  }

  supportDynamicLayers = (listItem): boolean => {
    const layer = listItem.layer
    // We only support map-image layer with dynamic layers, tile layer does not work
    if (layer.layer.type === SupportedJSAPILayerTypes.MapImageLayer && layer.layer.capabilities?.exportMap?.supportsDynamicLayers) {
      return true
    }
    return false
  }

  getSymbolType = (layer) => {
    let symbolType = null
    switch (layer.geometryType) {
      case 'point': {
        symbolType = JimuSymbolType.Point
        break
      }
      case 'polyline': {
        symbolType = JimuSymbolType.Polyline
        break
      }
      case 'polygon': {
        symbolType = JimuSymbolType.Polygon
      }
    }
    return symbolType
  }

  execute = (layerItem) => {
    const element = (
      <ChangeSymbolPopper
        widget={this.widget}
        listItem={layerItem}
        symbolType={this.getSymbolType(layerItem.layer)}
      />
    )
    this.widget.setState({ nativeActionPopper: element })
  }
}
