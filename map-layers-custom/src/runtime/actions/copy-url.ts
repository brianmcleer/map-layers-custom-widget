import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'

// Copies the layer's service URL to the clipboard. For feature layers the
// sublayer index is appended so the URL points at the exact layer.
export default class CopyUrl extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'copy-url'
    this.title = title
    this.className = 'esri-icon-link'
    this.group = ACTION_INDEXES.CopyUrl
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (!this.widget.props.config.extraLayerTools || this.widget.props.config.toolCopyUrl === false) return false
    const layer: any = layerItem && layerItem.layer
    return !!(layer && layer.url)
  }

  execute = (layerItem): void => {
    const layer: any = layerItem && layerItem.layer
    if (!layer || !layer.url) return
    const url = (layer.type === 'feature' && layer.layerId != null)
      ? `${layer.url}/${layer.layerId}`
      : layer.url
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(url).catch(() => { this.fallbackCopy(url) })
      } else {
        this.fallbackCopy(url)
      }
    } catch (e) {
      this.fallbackCopy(url)
    }
  }

  private fallbackCopy (text: string) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch (e) { /* clipboard unavailable */ }
  }
}
