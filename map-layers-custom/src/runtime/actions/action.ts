import type { Widget } from '../widget'

export default class Action {
  id: string = 'id'
  title: string = 'title'
  className: string = 'esri-icon'
  group: number = 0
  widget: Widget = null
  icon?: React.JSX.Element = null

  useMapWidget (): boolean {
    return this.widget.props.config.useMapWidget
  }

  isValid = (layerItem: any, isTableList: boolean = false): boolean => false
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  execute = (layerItem: any): void | React.JSX.Element => {}
}
