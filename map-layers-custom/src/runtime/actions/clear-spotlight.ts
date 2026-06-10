import Action from './action'
import type { Widget } from '../widget'
import { ACTION_INDEXES } from './constants'
import { restoreSpotlight } from './spotlight'

// Restores every layer to the opacity it had before a spotlight was applied.
// Only shown while a spotlight is active (i.e. there is a saved backup).
export default class ClearSpotlight extends Action {
  constructor (widget: Widget, title: string) {
    super()
    this.id = 'clear-spotlight'
    this.title = title
    this.className = 'esri-icon-close-circled'
    this.group = ACTION_INDEXES.ClearSpotlight
    this.widget = widget
  }

  isValid = (layerItem, isTableList): boolean => {
    if (isTableList) return false
    if (!this.useMapWidget() || !this.widget.props.config.extraLayerTools || this.widget.props.config.toolSpotlight === false) return false
    const backup: Map<any, boolean> = (this.widget as any)._spotlightVisBackup
    return !!backup && backup.size > 0
  }

  execute = (): void => {
    const w: any = this.widget
    try { if (typeof w.setState === 'function') w.setState({ spotlightExiting: true }) } catch (e) { /* noop */ }
    restoreSpotlight(w, { deferOverlayDismiss: true })
  }
}
