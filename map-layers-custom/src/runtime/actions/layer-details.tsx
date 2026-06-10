import { React } from 'jimu-core'
import Action from './action'
import type { Widget } from '../widget'
import LayerDetailsPanel from '../components/layer-details-panel'
import { ACTION_INDEXES } from './constants'

// Opens a floating panel with a rich, at-a-glance metadata summary for the
// layer (type, geometry, live feature count, fields, source, spatial ref, etc).
export default class LayerDetails extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'layer-details'
    this.title = title
    this.className = 'esri-icon-documentation'
    this.group = ACTION_INDEXES.Details
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (!this.widget.props.config.extraLayerTools || this.widget.props.config.toolDetails === false) return false
    return !!(layerItem && layerItem.layer)
  }

  execute = (layerItem): void => {
    this.widget.setState({ nativeActionPopper: <LayerDetailsPanel widget={this.widget} listItem={layerItem} /> })
  }
}
