import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'
import { reorderLayerItem } from './reorder-utils'

// Moves a layer to the bottom row of its group in the layer list.
export default class MoveToBottom extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'move-to-bottom'
    this.title = title
    this.className = 'esri-icon-down-arrow'
    this.group = ACTION_INDEXES.MoveBottom
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (isTableList) return false
    if (!this.useMapWidget() || !this.widget.props.config.extraLayerTools || this.widget.props.config.toolMove === false) return false
    return !!(layerItem && layerItem.layer)
  }

  execute = (layerItem): void => {
    const w: any = this.widget
    const view = w.viewFromMapWidget || w.jmvFromMap?.view
    const layerList = w.layerListRef?.current
    try { if (layerItem?.layer?.id != null) { (w._promotedLayerIds || (w._promotedLayerIds = new Set())).add(layerItem.layer.id) } } catch (e) { /* noop */ }
    reorderLayerItem(view, layerList, layerItem, 'bottom')
  }
}
