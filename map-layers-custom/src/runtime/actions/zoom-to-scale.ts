import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'

// "Zoom until visible": a layer that is greyed out because the map is outside its
// visible range gets one click that moves the map to a scale where it draws.
export default class ZoomToScale extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'zoom-to-scale'
    this.title = title
    this.className = 'esri-icon-zoom-in-magnifying-glass'
    this.group = ACTION_INDEXES.ZoomToScale
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (isTableList) return false
    const config: any = this.widget.props.config
    if (!this.useMapWidget() || !config.extraLayerTools || config.toolZoomToScale === false) return false
    const layer: any = layerItem?.layer
    if (!layer) return false
    const hasRange = (typeof layer.minScale === 'number' && layer.minScale > 0) || (typeof layer.maxScale === 'number' && layer.maxScale > 0)
    if (!hasRange) return false
    const view: any = this.widget.viewFromMapWidget || this.widget.jmvFromMap?.view
    const scale: number = view?.scale
    if (typeof scale !== 'number') return false
    // Only offered while the map is outside the range.
    const tooFarOut = layer.minScale > 0 && scale > layer.minScale
    const tooFarIn = layer.maxScale > 0 && scale < layer.maxScale
    return tooFarOut || tooFarIn
  }

  execute = (layerItem): void => {
    const layer: any = layerItem?.layer
    const view: any = this.widget.viewFromMapWidget || this.widget.jmvFromMap?.view
    if (!layer || !view || typeof view.goTo !== 'function') return
    const scale: number = view.scale
    let target: number | null = null
    if (layer.minScale > 0 && scale > layer.minScale) target = layer.minScale * 0.9
    else if (layer.maxScale > 0 && scale < layer.maxScale) target = layer.maxScale * 1.1
    if (target == null) return
    this.widget.beacon?.action('zoom-to-scale', String(layer.title ?? ''))
    try { view.goTo({ scale: target }).catch(() => { /* user interrupted */ }) } catch (e) { /* noop */ }
  }
}
