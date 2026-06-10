import Action from './action'
import type { Widget } from '../widget'
import { MutableStoreManager, SupportedJSAPILayerTypes } from 'jimu-core'
import { ACTION_INDEXES } from './constants'

const supportedLayerTypes = [
  SupportedJSAPILayerTypes.FeatureLayer,
  SupportedJSAPILayerTypes.CSVLayer,
  SupportedJSAPILayerTypes.ImageryLayer,
  SupportedJSAPILayerTypes.ImageryTileLayer,
  SupportedJSAPILayerTypes.GeoJSONLayer,
  SupportedJSAPILayerTypes.SubtypeSublayer,
  'sublayer'
]
export default class Popup extends Action {
  private readonly enableTitle: string
  private readonly disableTitle: string
  constructor (widget: Widget, enableTitle: string, disableTitle: string) {
    super()
    this.id = 'popup'
    this.className = 'esri-icon-configure-popup'
    this.group = ACTION_INDEXES.Popup
    this.widget = widget
    this.enableTitle = enableTitle
    this.disableTitle = disableTitle
  }

  isValid = (layerItem): boolean => {
    const layer = layerItem.layer
    if (typeof layer.id === 'string' && layer.id.startsWith('jimu-draw')) {
      return false
    }
    const jmv = this.widget.jmvFromMap
    const widgetId = this.widget.props.widgetId
    const mutableStore = MutableStoreManager.getInstance()
    const layerStatus = mutableStore.getStateValue([widgetId, 'popup', layer.id])
    // For the WMSSublayer, it does not have the type field, so check the parent's type instead, see #30401
    if (layer && this.widget.props.config?.popup && (supportedLayerTypes.includes(layer.type) || layer.parent?.type === SupportedJSAPILayerTypes.WMSLayer)) {
      const popupEnabled = (layer.popupEnabled && jmv?.isClickOpenPopupEnabled()) || layerStatus?.popupEnabled
      this.title = popupEnabled ? this.disableTitle : this.enableTitle
      return true
    } else {
      return false
    }
  }

  execute = (layerItem): void => {
    const layer = layerItem.layer
    const jmv = this.widget.jmvFromMap
    const widgetId = this.widget.props.widgetId
    const mutableStore = MutableStoreManager.getInstance()

    const prevStatus = mutableStore.getStateValue([widgetId, 'popup', layer.id])
    const newStatus = prevStatus || {}
    if (prevStatus?.initialValue === undefined) {
      newStatus.initialValue = layer.popupEnabled
      newStatus.layer = layer
    }
    if (this.title === this.disableTitle) {
      layer.popupEnabled = false
      jmv.disableLayerPopup(layer)
      newStatus.popupEnabled = false
    } else {
      layer.popupEnabled = true
      jmv.enableLayerPopup(layer, true)
      newStatus.popupEnabled = true
    }

    mutableStore.updateStateValue(widgetId, `popup.${layer.id}`, newStatus)
  }
}
