/*
  Export layer list (src/runtime/lib/layer-csv.ts) and the deep search text
  (src/runtime/lib/search-index.ts).

    node --test tests/*.cjs          (from the widget folder)
*/
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ts = require(process.env.TYPESCRIPT_PATH || 'typescript')
const root = path.resolve(__dirname, '..')

function loadTs (rel) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText
  const mod = { exports: {} }
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: () => ({}), Map, Promise, Math, String, Array }, { filename: rel })
  return mod.exports
}

const csv = loadTs('src/runtime/lib/layer-csv.ts')
const labels = { layer: 'Layer', group: 'Group', type: 'Type', on: 'On', opacity: 'Opacity', minScale: 'Min scale', maxScale: 'Max scale', url: 'URL', yes: 'Yes', no: 'No' }

test('csvCell quotes commas and quotes, and defuses formulas', () => {
  assert.equal(csv.csvCell('plain'), 'plain')
  assert.equal(csv.csvCell('a, b'), '"a, b"')
  assert.equal(csv.csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csv.csvCell('=SUM(A1)'), "'=SUM(A1)")
  assert.equal(csv.csvCell('+1'), "'+1")
  assert.equal(csv.csvCell(null), '')
})

test('buildLayerCsv walks groups and sublayers with a group path', () => {
  const sub = { declaredClass: 'esri.layers.support.Sublayer', id: 3, visible: true, layer: { url: 'https://x/arcgis/rest/services/Roads/MapServer' } }
  const items = [
    { title: 'Planning', layer: { declaredClass: 'esri.layers.GroupLayer', visible: true, opacity: 1 }, children: [
      { title: 'Zoning', layer: { declaredClass: 'esri.layers.FeatureLayer', type: 'feature', visible: false, opacity: 0.5, minScale: 50000, maxScale: 0, url: 'https://x/arcgis/rest/services/Zoning/FeatureServer', layerId: 2 }, children: [] }
    ] },
    { title: 'Roads', layer: { declaredClass: 'esri.layers.MapImageLayer', visible: true, opacity: 1, url: 'https://x/arcgis/rest/services/Roads/MapServer' }, children: [
      { title: 'Centerlines', layer: sub, children: [] }
    ] }
  ]
  const out = csv.buildLayerCsv(items, labels).split('\r\n')
  assert.equal(out[0], 'Layer,Group,Type,On,Opacity,Min scale,Max scale,URL')
  assert.equal(out[1], 'Planning,,GroupLayer,Yes,100,,,')
  assert.equal(out[2], 'Zoning,Planning,FeatureLayer,No,50,50000,,https://x/arcgis/rest/services/Zoning/FeatureServer/2')
  assert.equal(out[4], 'Centerlines,Roads,Sublayer,Yes,,,,https://x/arcgis/rest/services/Roads/MapServer/3')
  assert.equal(out[out.length - 1], '')
})

const idx = loadTs('src/runtime/lib/search-index.ts')

test('layerSearchText joins portal item and service metadata, strips html, lower-cases', () => {
  const layer = {
    portalItem: { title: 'Zoning 2024', snippet: 'Current <b>zoning</b> districts', description: '<p>Adopted by Council.</p>', tags: ['planning', 'land use'] },
    sourceJSON: { description: 'Service description', copyrightText: 'City of Grand Junction' }
  }
  const text = idx.layerSearchText(layer)
  assert.equal(text, 'zoning 2024 current zoning districts adopted by council. planning land use service description city of grand junction')
  assert.equal(idx.layerSearchText({}), '')
})

test('buildSearchIndex indexes layers and gives sublayers the parent text', async () => {
  const sub = { sourceJSON: { description: 'Street centerlines' } }
  const layers = [
    { loadStatus: 'loaded', portalItem: { loaded: true, snippet: 'Roads of the city' }, allSublayers: [sub] },
    { loadStatus: 'loaded' }
  ]
  const index = await idx.buildSearchIndex(layers)
  assert.equal(index.get(layers[0]), 'roads of the city')
  assert.equal(index.get(sub), 'roads of the city street centerlines')
  assert.equal(index.has(layers[1]), false)
})
