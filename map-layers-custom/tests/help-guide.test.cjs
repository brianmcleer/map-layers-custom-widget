/*
  In-widget help guide: content and writing-rule tests (WIDGETHANDOFF Section 10.9).

  Runs in plain Node with no Experience Builder runtime:
    node --test tests/*.cjs          (from the widget folder)

  helpSections.ts and translations/default.ts are transpiled on the fly with the client's
  TypeScript (resolved up the tree from client/node_modules), so the test always reads the
  real source. Set TYPESCRIPT_PATH to a typescript install if resolution fails.
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
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: () => ({}) }, { filename: rel })
  return mod.exports
}

const messages = loadTs('src/runtime/translations/default.ts').default
const { buildHelpSections } = loadTs('src/runtime/helpSections.ts')

/* The same translate the widget uses in spirit: id -> string, {token} filled from values. */
const t = (id, values) => {
  let text = messages[id]
  assert.equal(typeof text, 'string', `translation missing: ${id}`)
  if (values) Object.keys(values).forEach((k) => { text = text.split(`{${k}}`).join(values[k]) })
  return text
}

const LABEL_KEYS = [
  'tables', 'batchOptions', 'turnOnAllLayers', 'turnOffAllLayers', 'resetVisibility', 'zoomToVisible',
  'exportMapImage', 'showVisibleOnly', 'showAllLayers', 'expandAllLayers', 'collapseAllLayers', 'savedViews',
  'saveCurrentView', 'save', 'exportViews', 'importViews', 'addLayer', 'addLayerTitle', 'addLayerSubmit',
  'addLayerError', 'masterOpacity', 'basemap', 'legend', 'goto', 'showLabels', 'hideLabels', 'enablePopup',
  'disablePopup', 'transparency', 'visibilityRange', 'information', 'changeSymbol', 'soloLayer', 'flashLayer',
  'copyUrl', 'refreshLayer', 'layerDetails', 'spotlight', 'clearSpotlight', 'moveToTop', 'moveToBottom',
  'moveOutOfGroup', 'remove'
]
/* Strings that come from jimu-ui's shared messages at runtime, not this widget's file. */
const JIMU_LABELS = {
  batchOptions: 'Batch options', turnOnAllLayers: 'Turn on all layers', turnOffAllLayers: 'Turn off all layers',
  expandAllLayers: 'Expand all layers', collapseAllLayers: 'Collapse all layers', transparency: 'Transparency',
  remove: 'Remove'
}
const labelsText = {}
LABEL_KEYS.forEach((k) => { labelsText[k] = messages[k] ?? JIMU_LABELS[k]; assert.ok(labelsText[k], `label missing: ${k}`) })

const FLAGS = [
  'mapMode', 'tickBoxes', 'autoShowParents', 'reorder', 'layerLegend', 'tables', 'search', 'batch', 'layerCount',
  'collapsible', 'savedViews', 'addLayer', 'masterOpacity', 'basemapSwitcher', 'legendPanel', 'goto', 'labels',
  'popup', 'transparency', 'visibilityRange', 'information', 'changeSymbol', 'solo', 'flash', 'copyUrl', 'refresh',
  'details', 'spotlight', 'move'
]
const features = (on, overrides = {}) => {
  const f = { labelsText }
  FLAGS.forEach((k) => { f[k] = on })
  return Object.assign(f, overrides)
}
const allOn = features(true)
const allOff = features(false)
const textOf = (sections) => sections.map((s) => [s.title, s.intro ?? '', ...s.body].join('\n')).join('\n')

test('every string resolves and no {token} is left unfilled', () => {
  for (const f of [allOn, allOff]) {
    const txt = textOf(buildHelpSections(t, f))
    assert.doesNotMatch(txt, /\{[a-zA-Z]+\}/, 'unfilled token in guide text')
    assert.doesNotMatch(txt, /\bhelp[A-Z][A-Za-z0-9]*\b/, 'a translation key leaked into the guide')
  }
})

test('shared keys carry the shared wording', () => {
  assert.equal(messages.helpTitle, 'Help')
  assert.equal(messages.close, 'Close')
  assert.equal(messages.helpAnd, 'and')
  assert.equal(messages.firstRunTitle, 'New here?')
  assert.equal(messages.firstRunHelpLink, 'Open the guide.')
  assert.equal(messages.firstRunDismiss, 'Dismiss')
  assert.equal(messages.helpNoMatches, 'Nothing in the guide matches that word. Try another, or open the sections above.')
  assert.match(messages.helpSearchPlaceholder, /^Search the guide \(try "[^"]+" or "[^"]+"\)$/)
  assert.ok(messages.helpIntro.split('. ').length <= 1 || !messages.helpIntro.slice(0, -1).includes('. '), 'helpIntro is one sentence')
})

test('section order, unique keys, distinct icons; start first, trouble then tips last', () => {
  for (const f of [allOn, allOff]) {
    const s = buildHelpSections(t, f)
    const keys = s.map((x) => x.key)
    assert.equal(new Set(keys).size, keys.length, 'duplicate section key')
    const icons = s.map((x) => x.icon)
    assert.equal(new Set(icons).size, icons.length, 'duplicate section icon')
    assert.equal(keys[0], 'start')
    assert.equal(keys[keys.length - 2], 'trouble')
    assert.equal(keys[keys.length - 1], 'tips')
    assert.ok(s.every((x) => x.body.length > 0), 'a section rendered with an empty body')
  }
})

test('only start is ordered, and it has exactly three steps', () => {
  const s = buildHelpSections(t, allOn)
  s.forEach((x) => { assert.equal(!!x.ordered, x.key === 'start', `ordered on ${x.key}`) })
  assert.equal(s.find((x) => x.key === 'start').body.length, 3)
})

test('feature gating: sections appear with their flag and vanish without it', () => {
  const expect = {
    search: 'find', savedViews: 'views', addLayer: 'add'
  }
  for (const [flag, key] of Object.entries(expect)) {
    const on = buildHelpSections(t, features(false, { [flag]: true, mapMode: true }))
    const off = buildHelpSections(t, features(true, { [flag]: false }))
    assert.ok(on.some((s) => s.key === key), `${key} missing with ${flag} on`)
    assert.ok(!off.some((s) => s.key === key), `${key} present with ${flag} off`)
  }
  /* The menu section exists only when at least one layer action is on. */
  assert.ok(!buildHelpSections(t, allOff).some((s) => s.key === 'menu'))
  assert.ok(buildHelpSections(t, features(false, { information: true })).some((s) => s.key === 'menu'))
  /* The top-bar section exists only when at least one header control is on. */
  assert.ok(!buildHelpSections(t, allOff).some((s) => s.key === 'bar'))
  assert.ok(buildHelpSections(t, features(false, { collapsible: true })).some((s) => s.key === 'bar'))
  /* Where things live only when something is stored or added. */
  assert.ok(!buildHelpSections(t, allOff).some((s) => s.key === 'keep'))
})

test('feature gating: the words for an off feature are absent from the whole guide', () => {
  const wordFor = {
    savedViews: labelsText.savedViews, addLayer: labelsText.addLayerTitle, masterOpacity: labelsText.masterOpacity,
    basemapSwitcher: labelsText.basemap, solo: labelsText.soloLayer, flash: labelsText.flashLayer,
    copyUrl: labelsText.copyUrl, refresh: labelsText.refreshLayer, details: labelsText.layerDetails,
    spotlight: labelsText.spotlight, move: labelsText.moveToTop, goto: 'moves the map to where the layer is', labels: labelsText.showLabels,
    popup: labelsText.enablePopup, visibilityRange: labelsText.visibilityRange, information: labelsText.information,
    changeSymbol: labelsText.changeSymbol, tables: labelsText.tables, layerCount: 'badge', reorder: 'Drag a layer up or down',
    search: 'funnel', batch: labelsText.batchOptions
  }
  for (const [flag, word] of Object.entries(wordFor)) {
    const txt = textOf(buildHelpSections(t, features(true, { [flag]: false })))
    assert.ok(!txt.includes(word), `"${word}" still in the guide with ${flag} off`)
    const txtOn = textOf(buildHelpSections(t, allOn))
    assert.ok(txtOn.includes(word), `"${word}" missing from the guide with everything on`)
  }
})

test('map-widget-only controls stay out of the guide in data-source mode', () => {
  const txt = textOf(buildHelpSections(t, features(true, { mapMode: false, batch: true })))
  assert.ok(!txt.includes(labelsText.turnOnAllLayers))
  assert.ok(!txt.includes(labelsText.showVisibleOnly))
  assert.ok(txt.includes(labelsText.expandAllLayers), 'expand/collapse all still listed in data-source mode')
})

test('listOf builds "a", "a and b", "a, b and c"', () => {
  const only = textOf(buildHelpSections(t, features(false, { batch: true, mapMode: false })))
  assert.ok(only.includes(`${labelsText.batchOptions} (the checklist icon): ${labelsText.expandAllLayers} and ${labelsText.collapseAllLayers} open or close every group.`))
  const full = buildHelpSections(t, allOn).find((s) => s.key === 'bar').body[0]
  assert.match(full, /, [^,]+ and [^,]+\.$/)
  assert.ok(full.includes(labelsText.turnOnAllLayers) && full.includes(labelsText.exportMapImage))
})

test('search finds the words a real user would type', () => {
  const txt = textOf(buildHelpSections(t, allOn)).toLowerCase()
  for (const w of ['filter', 'legend', 'basemap', 'save', 'group', 'transparen', 'zoom', 'export']) {
    assert.ok(txt.includes(w), `"${w}" not findable`)
  }
})

test('writing rules: no em or en dashes, no banned jargon', () => {
  const guideKeys = Object.keys(messages).filter((k) => /^(help|firstRun)/.test(k))
  const txt = guideKeys.map((k) => messages[k]).join('\n')
  assert.doesNotMatch(txt, /[–—]/, 'em or en dash in guide text')
  for (const w of ['instance', 'session', 'persist', 'sync', 'toggle', 'modal']) {
    assert.doesNotMatch(txt, new RegExp(`\\b${w}`, 'i'), `banned word "${w}"`)
  }
})

test('troubleshooting lines follow "Symptom: cause. What to do." and end with the contact line', () => {
  const trouble = buildHelpSections(t, allOn).find((s) => s.key === 'trouble').body
  const contact = trouble[trouble.length - 1]
  assert.equal(contact, 'Still stuck? Contact the GIS Division and mention the Map Layers name and this app.')
  trouble.slice(0, -1).forEach((line) => {
    assert.ok(line.includes(': '), `no symptom colon: ${line}`)
    assert.ok(line.endsWith('.'), `no full stop: ${line}`)
  })
})

test('every control the guide names is spelled exactly as the interface spells it', () => {
  const txt = textOf(buildHelpSections(t, allOn))
  for (const k of LABEL_KEYS) {
    if (k === 'addLayerError') continue // quoted as the message the user sees, tested below
    assert.ok(txt.includes(labelsText[k]), `control name "${labelsText[k]}" (${k}) not in the guide`)
  }
  assert.ok(txt.includes(labelsText.addLayerError))
})
