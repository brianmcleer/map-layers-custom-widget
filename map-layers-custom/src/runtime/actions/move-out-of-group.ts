import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'
import { moveOutOfGroup } from './reorder-utils'

// Promotes a layer out of its group (one level up), placed next to the group.
// Only shown for layers that are actually inside a group layer.
export default class MoveOutOfGroup extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'move-out-of-group'
    this.title = title
    this.className = 'esri-icon-up'
    this.group = ACTION_INDEXES.MoveOut
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (isTableList) return false
    if (!this.useMapWidget() || !this.widget.props.config.extraLayerTools || this.widget.props.config.toolMove === false) return false
    // Only when the item lives inside a group layer.
    const parent: any = layerItem && layerItem.parent
    return !!(parent && parent.layer && parent.layer.layers)
  }

  execute = (layerItem): void => {
    const w: any = this.widget
    const view = w.viewFromMapWidget || w.jmvFromMap?.view
    const layerList = w.layerListRef?.current
    try { if (layerItem?.layer?.id != null) { (w._promotedLayerIds || (w._promotedLayerIds = new Set())).add(layerItem.layer.id) } } catch (e) { /* noop */ }
    moveOutOfGroup(view, layerList, layerItem)
  }
}
