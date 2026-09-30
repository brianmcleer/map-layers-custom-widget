/*
  Layer state in the URL (src/runtime/lib/share-link.ts).

    node --test tests/*.cjs          (from the widget folder)
*/
const test = require('node:test')
const assert = require('node:assert/strict')
// Arrays made inside the vm context have their own Array prototype; copy before deep comparing.
const arr = (x) => (x == null ? x : Array.from(x))
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ts = require(process.env.TYPESCRIPT_PATH || 'typescript')
const root = path.resolve(__dirname, '..')

function loadTs (rel) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, jsx: ts.JsxEmit.React } }).outputText
  const mod = { exports: {} }
  // jimu-core and jimu-ui are stubbed: only the pure exports are exercised here.
  const stub = () => new Proxy({}, { get: () => () => ({}) })
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: stub, URL, URLSearchParams, encodeURIComponent, decodeURIComponent, Number, String, Set, Array, Object }, { filename: rel })
  return mod.exports
}

const link = loadTs('src/runtime/lib/share-link.ts')

const layer = (id, visible, extra = {}) => ({ id, visible, declaredClass: 'esri.layers.FeatureLayer', ...extra })

test('visibleLayerIds lists switchable layers that are on, in order', () => {
  const layers = [
    layer('a', true),
    layer('b', false),
    layer('g', true, { declaredClass: 'esri.layers.GroupLayer' }),
    layer('h', true, { listMode: 'hide' }),
    layer('c', true)
  ]
  assert.deepEqual(arr(link.visibleLayerIds(layers)), ['a', 'c'])
})

test('buildShareLink keeps other parameters and readShareIds round-trips ids with commas and spaces', () => {
  const href = 'https://maps.example.org/experience/abc/?page=home&data_s=x'
  const ids = ['Parcels_123', 'Zoning, 2024', 'Fire Stations']
  const out = link.buildShareLink(href, ids)
  const u = new URL(out)
  assert.equal(u.searchParams.get('page'), 'home')
  assert.equal(u.searchParams.get('data_s'), 'x')
  assert.deepEqual(arr(link.readShareIds(u.search)), ids)
})

test('readShareIds is null without the parameter and empty with an empty value', () => {
  assert.equal(link.readShareIds('?page=home'), null)
  assert.deepEqual(arr(link.readShareIds('?mlc=')), [])
})

test('applyShareIds switches named layers on and the rest off, ignoring unknown ids', () => {
  const layers = [layer('a', false), layer('b', true), layer('c', false), layer('g', false, { declaredClass: 'esri.layers.GroupLayer' })]
  const found = link.applyShareIds(layers, ['a', 'c', 'nope'])
  assert.equal(found, 2)
  assert.deepEqual(layers.map(l => l.visible), [true, false, true, false])
})
