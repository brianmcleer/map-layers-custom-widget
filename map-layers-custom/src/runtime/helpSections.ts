import type { HelpSection } from './components/HelpPopup'

/**
 * Flags the widget computes from config and live status. One per feature that has help text.
 * widget.tsx computes these with the same checks the list, the header and the layer actions
 * use (config.x, config.x !== false, plus the map-widget-mode requirement), so the guide never
 * describes a control the widget is not currently showing.
 */
export interface HelpFeatures {
  /* how the list is wired */
  mapMode: boolean
  tickBoxes: boolean
  autoShowParents: boolean
  reorder: boolean
  layerLegend: boolean
  tables: boolean
  /* header */
  search: boolean
  batch: boolean
  layerCount: boolean
  collapsible: boolean
  savedViews: boolean
  addLayer: boolean
  masterOpacity: boolean
  basemapSwitcher: boolean
  legendPanel: boolean
  /* layer menu (three dots) */
  goto: boolean
  labels: boolean
  popup: boolean
  transparency: boolean
  visibilityRange: boolean
  information: boolean
  changeSymbol: boolean
  solo: boolean
  flash: boolean
  copyUrl: boolean
  refresh: boolean
  details: boolean
  spotlight: boolean
  move: boolean
  /* control names exactly as the interface shows them */
  labelsText: HelpLabels
}

export interface HelpLabels {
  tables: string
  batchOptions: string
  turnOnAllLayers: string
  turnOffAllLayers: string
  resetVisibility: string
  zoomToVisible: string
  exportMapImage: string
  showVisibleOnly: string
  showAllLayers: string
  expandAllLayers: string
  collapseAllLayers: string
  savedViews: string
  saveCurrentView: string
  save: string
  exportViews: string
  importViews: string
  addLayer: string
  addLayerTitle: string
  addLayerSubmit: string
  addLayerError: string
  masterOpacity: string
  basemap: string
  legend: string
  goto: string
  showLabels: string
  hideLabels: string
  enablePopup: string
  disablePopup: string
  transparency: string
  visibilityRange: string
  information: string
  changeSymbol: string
  soloLayer: string
  flashLayer: string
  copyUrl: string
  refreshLayer: string
  layerDetails: string
  spotlight: string
  clearSpotlight: string
  moveToTop: string
  moveToBottom: string
  moveOutOfGroup: string
  remove: string
}

type T = (id: string, values?: Record<string, string>) => string

export function buildHelpSections (t: T, f: HelpFeatures): HelpSection[] {
  const L = f.labelsText
  const when = (on: boolean, ...ids: string[]): string[] => (on ? ids.map((id: string) => t(id)) : [])
  const listOf = (parts: string[]): string =>
    parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} ${t('helpAnd')} ${parts[parts.length - 1]}`

  /* Which layer-menu items exist at all, in the order the menu lists them. */
  const menuLines: string[] = [
    ...(f.goto ? [t('helpMenuGoto', { goto: L.goto })] : []),
    ...(f.labels ? [t('helpMenuLabels', { showLabels: L.showLabels, hideLabels: L.hideLabels })] : []),
    ...(f.popup ? [t('helpMenuPopup', { enablePopup: L.enablePopup, disablePopup: L.disablePopup })] : []),
    ...(f.transparency ? [t('helpMenuTransparency', { transparency: L.transparency })] : []),
    ...(f.visibilityRange ? [t('helpMenuVisibilityRange', { visibilityRange: L.visibilityRange })] : []),
    ...(f.information ? [t('helpMenuInformation', { information: L.information })] : []),
    ...(f.changeSymbol ? [t('helpMenuChangeSymbol', { changeSymbol: L.changeSymbol })] : []),
    ...(f.solo ? [t('helpMenuSolo', { soloLayer: L.soloLayer })] : []),
    ...(f.flash ? [t('helpMenuFlash', { flashLayer: L.flashLayer })] : []),
    ...(f.copyUrl ? [t('helpMenuCopyUrl', { copyUrl: L.copyUrl })] : []),
    ...(f.refresh ? [t('helpMenuRefresh', { refreshLayer: L.refreshLayer })] : []),
    ...(f.details ? [t('helpMenuDetails', { layerDetails: L.layerDetails })] : []),
    ...(f.spotlight ? [t('helpMenuSpotlight', { spotlight: L.spotlight, clearSpotlight: L.clearSpotlight })] : []),
    ...(f.move ? [t('helpMenuMove', { moveToTop: L.moveToTop, moveToBottom: L.moveToBottom, moveOutOfGroup: L.moveOutOfGroup })] : []),
    ...(f.addLayer ? [t('helpMenuRemove', { remove: L.remove })] : [])
  ]
  const anyMenu = menuLines.length > 0

  /* The first menu item the user will see, for the third Start here step. */
  const firstAction =
    f.goto ? L.goto
      : f.labels ? L.showLabels
        : f.popup ? L.enablePopup
          : f.transparency ? L.transparency
            : f.visibilityRange ? L.visibilityRange
              : f.information ? L.information
                : f.solo ? L.soloLayer
                  : f.flash ? L.flashLayer
                    : f.details ? L.layerDetails
                      : f.spotlight ? L.spotlight
                        : L.goto

  /* The batch menu, assembled from the items that are actually in it. */
  const batchItems = listOf([
    ...(f.mapMode
      ? [
          t('helpBatchTurnOn', { turnOnAllLayers: L.turnOnAllLayers, turnOffAllLayers: L.turnOffAllLayers }),
          t('helpBatchReset', { resetVisibility: L.resetVisibility }),
          t('helpBatchZoom', { zoomToVisible: L.zoomToVisible }),
          t('helpBatchExport', { exportMapImage: L.exportMapImage })
        ]
      : []),
    t('helpBatchExpand', { expandAllLayers: L.expandAllLayers, collapseAllLayers: L.collapseAllLayers })
  ])

  const anyHeader = f.batch || f.savedViews || f.addLayer || f.masterOpacity || f.basemapSwitcher || f.legendPanel || f.collapsible

  const sections: HelpSection[] = [
    {
      key: 'start',
      icon: 'play',
      title: t('helpStartTitle'),
      ordered: true,
      body: [
        f.search ? t('helpStart1Search') : t('helpStart1'),
        f.tickBoxes ? t('helpStart2Tick') : t('helpStart2Eye'),
        anyMenu ? t('helpStart3Menu', { firstAction }) : t('helpStart3')
      ]
    },
    {
      key: 'layers',
      icon: 'layers',
      title: t('helpLayersTitle'),
      body: [
        f.tickBoxes ? t('helpLayersTick') : t('helpLayersEye'),
        t('helpLayersGroups'),
        f.autoShowParents ? t('helpLayersParentOn') : t('helpLayersParentOff'),
        ...when(f.layerCount, 'helpLayersCount'),
        ...when(f.layerLegend, 'helpLayersLegend'),
        ...when(f.reorder, 'helpLayersReorder'),
        ...(f.tables ? [t('helpLayersTables', { tables: L.tables })] : []),
        ...when(f.collapsible, 'helpLayersCollapse')
      ]
    }
  ]

  if (f.search) {
    sections.push({
      key: 'find',
      icon: 'search',
      title: t('helpFindTitle'),
      body: [
        t('helpFindType'),
        t('helpFindCount'),
        t('helpFindClear'),
        t('helpFindButton'),
        ...(f.batch && f.mapMode ? [t('helpFindVisibleOnly', { batchOptions: L.batchOptions, showVisibleOnly: L.showVisibleOnly, showAllLayers: L.showAllLayers })] : [])
      ]
    })
  }

  if (anyMenu) {
    sections.push({
      key: 'menu',
      icon: 'ellipsis',
      title: t('helpMenuTitle'),
      intro: t('helpMenuIntro'),
      body: menuLines
    })
  }

  if (anyHeader) {
    sections.push({
      key: 'bar',
      icon: 'sliders-horizontal',
      title: t('helpBarTitle'),
      intro: t('helpBarIntro'),
      body: [
        ...(f.batch ? [t('helpBarBatch', { batchOptions: L.batchOptions, batchItems })] : []),
        ...(f.savedViews ? [t('helpBarViews', { savedViews: L.savedViews })] : []),
        ...(f.addLayer ? [t('helpBarAdd', { addLayer: L.addLayer })] : []),
        ...(f.masterOpacity ? [t('helpBarOpacity', { masterOpacity: L.masterOpacity })] : []),
        ...(f.basemapSwitcher ? [t('helpBarBasemap', { basemap: L.basemap })] : []),
        ...(f.legendPanel ? [t('helpBarLegend', { legend: L.legend })] : []),
        ...when(f.collapsible, 'helpBarCollapse')
      ]
    })
  }

  if (f.savedViews) {
    sections.push({
      key: 'views',
      icon: 'bookmark',
      title: t('helpViewsTitle'),
      intro: t('helpViewsIntro'),
      body: [
        t('helpViews1', { saveCurrentView: L.saveCurrentView, save: L.save }),
        t('helpViews2'),
        t('helpViews3'),
        t('helpViews4', { exportViews: L.exportViews, importViews: L.importViews })
      ]
    })
  }

  if (f.addLayer) {
    sections.push({
      key: 'add',
      icon: 'plus',
      title: t('helpAddTitle'),
      intro: t('helpAddIntro', { addLayerTitle: L.addLayerTitle }),
      body: [
        t('helpAdd1', { addLayerSubmit: L.addLayerSubmit }),
        t('helpAdd2'),
        t('helpAdd3')
      ]
    })
  }

  if (f.savedViews || f.addLayer) {
    sections.push({
      key: 'keep',
      icon: 'folder',
      title: t('helpKeepTitle'),
      body: [
        ...when(f.savedViews, 'helpKeepViews', 'helpKeepViewsClear'),
        ...when(f.addLayer, 'helpKeepAdded'),
        t('helpKeepTicks')
      ]
    })
  }

  sections.push({
    key: 'trouble',
    icon: 'exclamation-mark-triangle',
    title: t('helpTroubleTitle'),
    body: [
      t('helpTroubleGrey'),
      ...when(!f.autoShowParents, 'helpTroubleGroupOff'),
      ...when(f.search, 'helpTroubleNoMatches'),
      ...(f.addLayer ? [t('helpTroubleAdd', { addLayerError: L.addLayerError })] : []),
      ...when(f.spotlight, 'helpTroubleFocus'),
      ...(f.batch && f.mapMode ? [t('helpTroubleReset', { batchOptions: L.batchOptions, resetVisibility: L.resetVisibility })] : []),
      t('helpTroubleReload'),
      t('helpTroubleContact')
    ]
  })

  sections.push({
    key: 'tips',
    icon: 'lightbulb',
    title: t('helpTipsTitle'),
    body: [
      t('helpTipsHover'),
      ...(f.solo ? [t('helpTipsSolo', { soloLayer: L.soloLayer })] : []),
      ...(f.batch && f.mapMode ? [t('helpTipsExport', { exportMapImage: L.exportMapImage, batchOptions: L.batchOptions })] : []),
      ...when(f.savedViews, 'helpTipsViews'),
      ...(f.transparency ? [t('helpTipsOpacity', { transparency: L.transparency })] : [])
    ]
  })

  return sections
}
