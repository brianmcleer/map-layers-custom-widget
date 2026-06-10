import { React } from 'jimu-core'
import Action from './action'
import type { Widget } from '../widget'
import TransparencySlider from '../components/transparency-slider'
import { TransparencyOutlined } from 'jimu-icons/outlined/application/transparency'
import { ACTION_INDEXES } from './constants'

export default class Transparency extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'transparency'
    this.title = title
    this.className = 'esri-icon-sliders-horizontal'
    this.group = ACTION_INDEXES.Transparency
    this.widget = widget
    this.icon = <TransparencyOutlined />
  }

  isValid = (layerItem, isTableList): boolean => {
    if (isTableList) {
      return false
    }
    if (layerItem.parent && layerItem.parent.layer.declaredClass !== 'esri.layers.GroupLayer') {
      return false
    }
    if (this.useMapWidget() && this.widget.props.config.opacity) {
      return true
    } else {
      return false
    }
  }

  execute = (layerItem) => {
    const element = <TransparencySlider widget={this.widget} listItem={layerItem} />
    this.widget.setState({ nativeActionPopper: element })
  }
}
