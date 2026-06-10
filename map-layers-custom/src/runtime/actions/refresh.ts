import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'

// Forces a layer to re-fetch its data — handy for frequently-updated feeds.
export default class Refresh extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'refresh-layer'
    this.title = title
    this.className = 'esri-icon-refresh'
    this.group = ACTION_INDEXES.Refresh
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (!this.widget.props.config.extraLayerTools || this.widget.props.config.toolRefresh === false) return false
    const layer: any = layerItem && layerItem.layer
    return !!(layer && typeof layer.refresh === 'function')
  }

  execute = (layerItem): void => {
    const layer: any = layerItem && layerItem.layer
    try {
      if (layer && typeof layer.refresh === 'function') {
        layer.refresh()
      }
    } catch (e) {
      console.error('Refresh layer failed', e)
    }
  }
}
