import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'
import { isFavorite, toggleFavorite } from '../lib/favorites'

// Star or unstar a layer. Favorites are per browser; the header's batch menu can
// filter the list down to them and starred names carry a star in the list.
export default class Favorite extends Action {
  titleAdd: string
  titleRemove: string

  constructor (widget: Widget, titleAdd: string, titleRemove: string) {
    super()
    this.id = 'favorite'
    this.className = 'esri-icon-favorites'
    this.group = ACTION_INDEXES.Favorite
    this.widget = widget
    this.titleAdd = titleAdd
    this.titleRemove = titleRemove
  }

  isValid = (layerItem, isTableList): boolean => {
    if (isTableList) return false
    if (!this.useMapWidget() || !this.widget.props.config.enableFavorites) return false
    const layer: any = layerItem?.layer
    if (!layer || layer.id == null || layer.listMode === 'hide') return false
    if (layer.declaredClass === 'esri.layers.GroupLayer') return false
    this.title = isFavorite(this.widget.props.id, layer.id) ? this.titleRemove : this.titleAdd
    return true
  }

  execute = (layerItem): void => {
    const layer: any = layerItem?.layer
    if (!layer) return
    const now = toggleFavorite(this.widget.props.id, layer.id)
    this.widget.beacon?.action(now ? 'favorite-add' : 'favorite-remove', String(layer.title ?? ''))
    this.widget.refreshAllTitles()
  }
}
