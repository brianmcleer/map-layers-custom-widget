/** @jsx jsx */
import { jsx, css, React, type MapDataSource } from 'jimu-core'
import { DataActionList, DropdownItem } from 'jimu-ui'
import type Action from '../actions/action'
import type { ReactNode } from 'react'
import type { JimuMapView } from 'jimu-arcgis'
import { styled } from 'jimu-theme'
import { ACTION_INDEXES } from '../actions/constants'

const Wrapper = styled.div`
  min-width: 120px;
  min-height: 20px;
`

const dataActionListStyle = css`
  .jimu-dropdown-item.jimu-dropdown-item-header {
    display: flex;
    justify-content: center;
  }
  .jimu-dropdown {
    .jimu-dropdown-item {
      display: flex;
      justify-content: center;
    }
  }
`

interface ActionListProps {
  widgetId: string
  jimuMapView: JimuMapView
  mapDataSource: MapDataSource
  actionObjects: Action[]
  listItem: any
  children?: ReactNode
  onActionListItemClick: () => void
  shouldHideEmptyList?: boolean
  enableDataAction?: boolean
  optionBtnRef?: React.MutableRefObject<HTMLElement | null>
}

interface ActionListItemProps {
  /**
   * Icon could be an Esri icon class name or a custom Icon component
   */
  icon: string | React.ReactNode
  title: string
  onClick?: () => void
}

function ActionListItem (props: ActionListItemProps) {
  const { icon, title, onClick } = props
  return (
    <DropdownItem onClick={onClick}>
      <div className='d-flex align-items-center'>
        {typeof icon === 'string' ? <div className={`jimu-icon-auto-color ${icon}`} /> : icon}
        <span className='ml-2'>{title}</span>
      </div>
    </DropdownItem>
  )
}

export default function MapLayersActionList (props: ActionListProps) {
  const { widgetId, actionObjects, listItem, onActionListItemClick, jimuMapView, shouldHideEmptyList, enableDataAction = true, mapDataSource, optionBtnRef } = props
  const [dataActionList, setDataActionList] = React.useState(null)
  const [isLoading, setIsLoading] = React.useState(enableDataAction)
  const listRef = React.useRef(null)

  const createListItem = (actionObject: Action, index: any, skipRemoveAction?: boolean) => {
    // The className is an Esri icon className
    const icon = actionObject?.icon || actionObject.className
    const title = actionObject.title
    // For the remove action, put it at the end of the list
    if (skipRemoveAction && actionObject.group === ACTION_INDEXES.Remove) {
      return
    }
    const onExecute = () => {
      actionObject.execute(listItem)
      onActionListItemClick()
    }
    return <ActionListItem key={index} icon={icon} title={title} onClick={() => { onExecute() }}></ActionListItem>
  }

  React.useEffect(() => {
    async function getDataActionList () {
      // The map data source might come from a data-source object or from a map widget data-source id
      let dataSets = []
      try {
        let featureDS = null
        if (mapDataSource) {
          featureDS = mapDataSource.getDataSourceByLayer(listItem.layer)
        } else if (jimuMapView) {
          const jimuLayerView = jimuMapView?.getJimuLayerViewByAPILayer(listItem.layer)
          featureDS = jimuLayerView ? await jimuLayerView.getOrCreateLayerDataSource() : await jimuMapView.getMapDataSource().createDataSourceByLayer(listItem.layer)
        }
        // Let the data-action-list handle the empty case
        dataSets = featureDS ? [{ dataSource: featureDS, records: [], name: featureDS?.getLabel() }] : []
      } catch (e) {
        console.error('DataSource create error:', e)
      } finally {
        if (listRef.current) {
          // If the DataActionList is reused, the actionElement will flicker for the first time
          const dataActionList = (
            <div className="data-action-list-wrapper" css={dataActionListStyle}>
              <DataActionList key={Math.random()} widgetId={widgetId} dataSets={dataSets} hideGroupTitle shouldHideEmptyList={shouldHideEmptyList} onActionListItemClick={onActionListItemClick} actionPanelRefDOM={optionBtnRef.current} whenListLoaded={() => { setIsLoading(false) }}></DataActionList>
            </div>
          )
          setDataActionList(dataActionList)
        }
      }
    }

    enableDataAction && getDataActionList()
  }, [enableDataAction, listItem.layer, onActionListItemClick, shouldHideEmptyList, widgetId, jimuMapView, mapDataSource, optionBtnRef])

  return (
    <Wrapper ref={listRef}>
      {
        actionObjects.map((actionObject, index) => {
          return createListItem(actionObject, index, true)
        })
      }
      {enableDataAction && dataActionList}
      {!isLoading && actionObjects.filter(actionObject => actionObject.group === ACTION_INDEXES.Remove).map((actionObject) => {
        return createListItem(actionObject, 'remove-key')
      })}
    </Wrapper>
  )
}
