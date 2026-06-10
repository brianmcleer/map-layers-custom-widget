// Move a layer to the absolute top or bottom of the whole layer list, lifting
// it out of any group it lives in so users can place layers anywhere. The
// draw-order direction is detected from the list itself (rather than assumed),
// so "top" always means the top row the user sees. Service sublayers cannot
// leave their service, so those are moved to the top/bottom within the service.

const toArr = (coll: any): any[] => {
  if (!coll) return []
  return coll.toArray ? coll.toArray() : coll
}

const includes = (coll: any, item: any): boolean => {
  if (!coll) return false
  if (typeof coll.includes === 'function') {
    try { return coll.includes(item) } catch (e) { /* noop */ }
  }
  if (typeof coll.indexOf === 'function') {
    try { return coll.indexOf(item) > -1 } catch (e) { /* noop */ }
  }
  return false
}

// Reorder a Sublayer to the top/bottom row within its service, using the list's
// own sibling order so the index convention does not matter.
const reorderSublayer = (parentItem: any, layer: any, position: 'top' | 'bottom') => {
  const collection = parentItem?.layer?.sublayers
  if (!collection || typeof collection.reorder !== 'function') return
  const sibs = toArr(parentItem.children)
  let targetIndex = -1
  if (sibs.length > 0) {
    const edge = position === 'top' ? sibs[0] : sibs[sibs.length - 1]
    if (edge && edge.layer && typeof collection.indexOf === 'function') {
      targetIndex = collection.indexOf(edge.layer)
    }
  }
  if (targetIndex < 0) targetIndex = position === 'top' ? collection.length - 1 : 0
  try { collection.reorder(layer, targetIndex) } catch (e) { console.error('Sublayer reorder failed', e) }
}

// Detect whether the top row corresponds to the highest collection index.
const detectHighestIsTop = (layerList: any, mapLayers: any): boolean => {
  const topItems = toArr(layerList && layerList.operationalItems)
  if (topItems.length >= 2 && typeof mapLayers.indexOf === 'function') {
    const a = mapLayers.indexOf(topItems[0].layer)
    const b = mapLayers.indexOf(topItems[topItems.length - 1].layer)
    if (a > -1 && b > -1) return a > b
  }
  return true
}

// Promote a layer one level up: out of its group and into the group's own
// container (the parent group, or the map), placed right next to the group.
// Repeated use walks the layer all the way out to the top level.
export const moveOutOfGroup = (view: any, layerList: any, layerItem: any): void => {
  if (!view || !view.map || !layerItem || !layerItem.layer) return
  const layer: any = layerItem.layer
  const mapLayers: any = view.map.layers

  // Find the layer's REAL parent group by walking the actual map tree, rather
  // than trusting the list item's parent (which can be unreliable). Returns the
  // group layer that directly contains `layer`, and that group's own container.
  const findParent = (): { group: any, container: any } | null => {
    let result: { group: any, container: any } | null = null
    const walk = (coll: any, group: any, container: any) => {
      if (!coll || result) return
      const arr = coll.toArray ? coll.toArray() : coll
      for (const l of arr) {
        if (result) return
        if (l === layer || (l && layer && l.id === layer.id)) {
          if (group) result = { group, container: container || mapLayers }
          return
        }
        if (l && l.layers) {
          // l is a group layer; its children's container is l.layers, and l
          // itself sits in `coll`.
          walk(l.layers, l, coll)
        }
      }
    }
    walk(mapLayers, null, null)
    return result
  }

  const found = findParent()
  if (!found || !found.group || !found.group.layers) return // not inside a group

  const group: any = found.group
  const container: any = found.container || mapLayers
  if (!container || typeof container.add !== 'function') return

  try {
    group.layers.remove(layer)
  } catch (e) {
    console.error('Move out of group: detach failed', e)
    return
  }

  const highestIsTop = detectHighestIsTop(layerList, mapLayers)
  let gIdx = -1
  if (typeof container.indexOf === 'function') gIdx = container.indexOf(group)
  let insertIdx: number
  if (gIdx < 0) insertIdx = container.length
  else insertIdx = highestIsTop ? gIdx + 1 : gIdx

  try {
    container.add(layer, insertIdx)
  } catch (e) {
    console.error('Move out of group: insert failed', e)
  }
}

export const reorderLayerItem = (
  view: any,
  layerList: any,
  layerItem: any,
  position: 'top' | 'bottom'
): void => {
  if (!view || !view.map || !layerItem || !layerItem.layer) return
  const layer: any = layerItem.layer
  const map: any = view.map
  const mapLayers: any = map.layers
  const parentItem: any = layerItem.parent

  // Service sublayers stay within their service.
  if (parentItem && parentItem.layer && parentItem.layer.sublayers && includes(parentItem.layer.sublayers, layer)) {
    reorderSublayer(parentItem, layer, position)
    return
  }

  if (!mapLayers || typeof mapLayers.reorder !== 'function') {
    console.error('Reorder: map has no reorderable layers collection')
    return
  }

  // Detect orientation from the top-level rows: does the first (top) row have a
  // higher map index than the last (bottom) row?
  const topItems = toArr(layerList && layerList.operationalItems)
  let highestIsTop = true
  if (topItems.length >= 2 && typeof mapLayers.indexOf === 'function') {
    const firstIdx = mapLayers.indexOf(topItems[0].layer)
    const lastIdx = mapLayers.indexOf(topItems[topItems.length - 1].layer)
    if (firstIdx > -1 && lastIdx > -1) highestIsTop = firstIdx > lastIdx
  }

  // Detach the layer from wherever it currently lives.
  const groupColl = parentItem && parentItem.layer && parentItem.layer.layers
  try {
    if (groupColl && includes(groupColl, layer)) {
      groupColl.remove(layer)
    } else if (includes(mapLayers, layer)) {
      mapLayers.remove(layer)
    }
  } catch (e) {
    console.error('Reorder detach failed', e)
    return
  }

  // Re-insert at the extreme that corresponds to the requested row.
  // add(item, length) appends (end of collection); add(item, 0) prepends.
  const wantEnd = (position === 'top') ? highestIsTop : !highestIsTop
  try {
    if (wantEnd) {
      mapLayers.add(layer)
    } else {
      mapLayers.add(layer, 0)
    }
  } catch (e) {
    console.error('Reorder insert failed', e)
  }
}
