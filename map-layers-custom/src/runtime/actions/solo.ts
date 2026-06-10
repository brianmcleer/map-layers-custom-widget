import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'

// "Show only this layer" (a.k.a. solo / isolate). Turns every other
// operational layer off in a single click, then makes the clicked layer —
// and all of its parent group layers — visible. Handy for quickly focusing
// the map on one dataset without manually toggling everything else off.
export default class Solo extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'solo-layer'
    this.title = title
    // Calcite "view-visible" maps to this esri icon; keeps styling consistent
    // with the other native list-item actions.
    this.className = 'esri-icon-visible'
    this.group = ACTION_INDEXES.Solo
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (isTableList) {
      return false
    }
    // Only meaningful in map-widget mode where we can drive layer visibility,
    // and only when the author enabled the option.
    if (!this.useMapWidget() || !this.widget.props.config.soloLayer) {
      return false
    }
    // Need a real, toggleable layer.
    if (!layerItem?.layer || layerItem.layer.listMode === 'hide') {
      return false
    }
    return true
  }

  execute = (layerItem): void => {
    const jmv = this.widget.jmvFromMap
    if (!jmv) {
      return
    }

    // 1) Turn everything off.
    try {
      const allJlv = jmv.getAllJimuLayerViews() || []
      for (const jlv of allJlv) {
        if (jlv?.layer && typeof jlv.layer.visible === 'boolean') {
          jlv.layer.visible = false
        }
      }
    } catch (e) {
      console.error('Solo action: failed to reset layer visibility', e)
    }

    // 2) Turn the clicked layer and all of its ancestor group layers back on,
    //    so it actually renders even when nested inside collapsed groups.
    let layer: any = layerItem.layer
    while (layer) {
      try {
        layer.visible = true
      } catch (e) { /* some layers are not directly toggleable */ }
      layer = layer.parent && layer.parent.declaredClass ? layer.parent : null
    }
  }
}
