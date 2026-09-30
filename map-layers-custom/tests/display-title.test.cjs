/*
  List titles (src/runtime/lib/display-title.ts) and the imagery index reader
  (src/runtime/lib/eli.ts).

    node --test tests/*.cjs          (from the widget folder)
*/
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ts = require(process.env.TYPESCRIPT_PATH || 'typescript')
const root = path.resolve(__dirname, '..')
const arr = (x) => (x == null ? x : Array.from(x))

function loadTs (rel) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText
  const mod = { exports: {} }
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: () => ({}), Set, Array, String, RegExp, Infinity, isFinite, decodeURIComponent }, { filename: rel })
  return mod.exports
}

const dt = loadTs('src/runtime/lib/display-title.ts')

test('cleanTitle: underscores, prefix strip, title case, and off means untouched', () => {
  assert.equal(dt.cleanTitle('GJ_Parcels_2024', { clean: false }), 'GJ_Parcels_2024')
  assert.equal(dt.cleanTitle('GJ_Parcels_2024', { clean: true }), 'GJ Parcels 2024')
  assert.equal(dt.cleanTitle('GJ_Parcels_2024', { clean: true, prefix: 'GJ_|sde\\.' }), 'Parcels 2024')
  assert.equal(dt.cleanTitle('sde.ROAD_centerlines', { clean: true, prefix: 'GJ_|sde\\.', titleCase: true }), 'ROAD Centerlines')
  assert.equal(dt.cleanTitle('fire_stations_of_the_city', { clean: true, titleCase: true }), 'Fire Stations of the City')
  assert.equal(dt.cleanTitle('GJ_', { clean: true, prefix: 'GJ_' }), 'GJ_', 'never empties a name')
  assert.equal(dt.cleanTitle('x_y', { clean: true, prefix: '(' }), 'x y', 'a bad pattern is ignored')
})

test('decorateTitle: star first, then the service note', () => {
  assert.equal(dt.decorateTitle('Parcels', {}), 'Parcels')
  assert.equal(dt.decorateTitle('Parcels', { favorite: true }), '★ Parcels')
  assert.equal(dt.decorateTitle('Parcels', { favorite: true, unavailable: 'service not answering' }), '★ Parcels (service not answering)')
})

const eli = loadTs('src/runtime/lib/eli.ts')

const feature = (props, coords) => ({ type: 'Feature', properties: props, geometry: coords ? { type: 'Polygon', coordinates: [coords] } : null })
const index = {
  type: 'FeatureCollection',
  features: [
    feature({ id: 'co-ortho', name: 'Colorado orthos', type: 'tms', url: 'https://{switch:a,b}.tiles.example.org/{zoom}/{x}/{y}.jpg', best: true, attribution: { text: 'State of Colorado' } }, [[-109.1, 36.9], [-102, 36.9], [-102, 41.1], [-109.1, 41.1], [-109.1, 36.9]]),
    feature({ id: 'world', name: 'World imagery', type: 'tms', url: 'https://tiles.example.org/{zoom}/{x}/{y}.png' }, null),
    feature({ id: 'tx', name: 'Texas orthos', type: 'tms', url: 'https://t.example.org/{zoom}/{x}/{y}.png' }, [[-106.7, 25.8], [-93.5, 25.8], [-93.5, 36.5], [-106.7, 36.5], [-106.7, 25.8]]),
    feature({ id: 'wms1', name: 'A county WMS', type: 'wms', url: 'https://gis.example.org/wms?FORMAT=image/jpeg&VERSION=1.3.0&SERVICE=WMS&REQUEST=GetMap&LAYERS=ortho2023,roads&STYLES=&CRS={proj}&WIDTH={width}&HEIGHT={height}&BBOX={bbox}' }, null),
    feature({ id: 'bing', name: 'Bing', type: 'bing', url: 'https://bing' }, null),
    feature({ id: 'flip', name: 'Flipped', type: 'tms', url: 'https://f.example.org/{zoom}/{x}/{-y}.png' }, null)
  ]
}

test('parseEli keeps tms and wms only, drops flipped-y templates, reads bboxes', () => {
  const entries = eli.parseEli(index)
  assert.deepEqual(arr(entries.map(e => e.id)), ['co-ortho', 'world', 'tx', 'wms1'])
  assert.deepEqual(arr(entries[0].bbox), [-109.1, 36.9, -102, 41.1])
  assert.equal(entries[1].bbox, null)
  assert.equal(entries[0].attribution, 'State of Colorado')
})

test('nearby keeps sources covering the extent, regional then worldwide, best first', () => {
  const entries = eli.parseEli(index)
  const gj = [-108.7, 39.0, -108.4, 39.2] // Grand Junction
  assert.deepEqual(arr(eli.nearby(entries, gj).map(e => e.id)), ['co-ortho', 'wms1', 'world'])
  assert.deepEqual(arr(eli.nearby(entries, gj, 'world').map(e => e.id)), ['world'])
  assert.deepEqual(arr(eli.nearby(entries, null).map(e => e.id)), ['wms1', 'world'], 'no extent: worldwide only')
})

test('toLayerSpec converts tms templates and wms GetMap templates', () => {
  const entries = eli.parseEli(index)
  const tms = eli.toLayerSpec(entries[0])
  assert.equal(tms.kind, 'webtile')
  assert.equal(tms.urlTemplate, 'https://{subDomain}.tiles.example.org/{level}/{col}/{row}.jpg')
  assert.deepEqual(arr(tms.subDomains), ['a', 'b'])
  const wms = eli.toLayerSpec(entries[3])
  assert.equal(wms.kind, 'wms')
  assert.equal(wms.url, 'https://gis.example.org/wms')
  assert.deepEqual(arr(wms.layers), ['ortho2023', 'roads'])
  assert.equal(wms.imageFormat, 'image/jpeg')
  assert.equal(wms.version, '1.3.0')
})
