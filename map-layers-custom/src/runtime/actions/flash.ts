import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'

// "Flash" a layer: ensure it (and its parents) are on, then blink its
// visibility a few times so the user can spot it on a busy map. Ends visible.
export default class Flash extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'flash-layer'
    this.title = title
    this.className = 'esri-icon-locate'
    this.group = ACTION_INDEXES.Flash
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (isTableList) return false
    if (!this.useMapWidget() || !this.widget.props.config.extraLayerTools || this.widget.props.config.toolFlash === false) return false
    const layer: any = layerItem && layerItem.layer
    return !!layer && typeof layer.visible === 'boolean' && layer.listMode !== 'hide'
  }

  execute = (layerItem): void => {
    const layer: any = layerItem && layerItem.layer
    if (!layer || typeof layer.visible !== 'boolean') return
    try {
      if (typeof (this.widget as any).ensureAncestorsVisible === 'function') {
        (this.widget as any).ensureAncestorsVisible(layer)
      }
    } catch (e) { /* noop */ }
    layer.visible = true
    let n = 0
    const tick = () => {
      // off, on, off, on, off, then settle on.
      layer.visible = (n % 2 === 1)
      n++
      if (n <= 5) {
        setTimeout(tick, 220)
      } else {
        layer.visible = true
      }
    }
    setTimeout(tick, 220)
  }
}
