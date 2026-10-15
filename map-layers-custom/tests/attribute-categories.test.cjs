/*
  Expand layers by attribute value: the SQL and label logic (src/runtime/lib/attribute-categories.ts).
  Runs in plain Node: node --test tests/*.cjs
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

const lib = loadTs('src/runtime/lib/attribute-categories.ts')
const { buildCategoryExpression, categoryKey, sqlLiteral, sqlField, rowsToValues, domainLabels, labelFor, shownCount, isCategoryFieldType, NULL_KEY } = lib

const values = (...vs) => vs.map((v) => ({ value: v, label: v === null ? '(no value)' : String(v) }))
/* Values cross a vm context, so compare by JSON rather than by prototype. */
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b))
const set = (...keys) => new Set(keys.map(categoryKey))

test('nothing unchecked returns the base expression untouched', () => {
  assert.equal(buildCategoryExpression('STATUS = 1', 'TYPE', true, values('A', 'B'), new Set()), 'STATUS = 1')
  assert.equal(buildCategoryExpression(null, 'TYPE', true, values('A', 'B'), new Set()), '')
  assert.equal(buildCategoryExpression('  ', 'TYPE', true, values('A', 'B'), new Set()), '')
})

test('unchecking a string value hides it and keeps nulls', () => {
  assert.equal(buildCategoryExpression(null, 'TYPE', true, values('A', 'B', 'C'), set('B')), "(TYPE NOT IN ('B') OR TYPE IS NULL)")
})

test('the base expression is kept with AND', () => {
  assert.equal(buildCategoryExpression('ZONE = 2', 'TYPE', true, values('A', 'B'), set('A')), "(ZONE = 2) AND ((TYPE NOT IN ('A') OR TYPE IS NULL))")
})

test('numbers are not quoted, strings are, quotes are doubled', () => {
  assert.equal(buildCategoryExpression(null, 'CODE', false, values(1, 2, 3), set(2, 3)), '(CODE NOT IN (2, 3) OR CODE IS NULL)')
  assert.equal(sqlLiteral("O'Brien", true), "'O''Brien'")
  assert.equal(sqlLiteral('12', false), '12')
  assert.equal(sqlLiteral('abc', false), "'abc'")
})

test('the null row is hidden with IS NOT NULL and skips the OR', () => {
  assert.equal(buildCategoryExpression(null, 'TYPE', true, values('A', null), set(null)), 'TYPE IS NOT NULL')
  assert.equal(buildCategoryExpression(null, 'TYPE', true, values('A', 'B', null), set('A', null)), "TYPE NOT IN ('A') AND TYPE IS NOT NULL")
})

test('everything unchecked draws nothing', () => {
  assert.equal(buildCategoryExpression(null, 'TYPE', true, values('A', 'B'), set('A', 'B')), '1=0')
  assert.equal(buildCategoryExpression('X = 1', 'TYPE', true, values('A', 'B'), set('A', 'B')), '(X = 1) AND (1=0)')
})

test('unchecked keys the list does not hold are ignored', () => {
  assert.equal(buildCategoryExpression(null, 'TYPE', true, values('A', 'B'), set('Z')), '')
})

test('odd field names are quoted', () => {
  assert.equal(sqlField('TYPE'), 'TYPE')
  assert.equal(sqlField('Land Use'), '"Land Use"')
  assert.equal(sqlField('a.b_c'), 'a.b_c')
})

test('category keys keep numbers, strings and null apart', () => {
  assert.equal(categoryKey(null), NULL_KEY)
  assert.equal(categoryKey(undefined), NULL_KEY)
  assert.equal(categoryKey(5), '5')
  assert.equal(categoryKey('5'), '5')
})

test('rows become sorted, de-duplicated values with domain names and counts', () => {
  const labels = domainLabels({ codedValues: [{ code: 'R', name: 'Residential' }, { code: 'C', name: 'Commercial' }] })
  const rows = [
    { attributes: { TYPE: 'R', mlc_count: 10 } },
    { attributes: { type: 'C', mlc_count: 4 } },
    { attributes: { TYPE: null, mlc_count: 2 } },
    { attributes: { TYPE: 'R', mlc_count: 1 } },
    { attributes: { TYPE: '', mlc_count: 3 } }
  ]
  const out = rowsToValues(rows, 'TYPE', 'mlc_count', labels, '(no value)', '(blank)', 50)
  assert.equal(out.truncated, false)
  same(out.values.map((v) => v.label), ['(blank)', 'Commercial', 'Residential', '(no value)'])
  same(out.values.map((v) => v.count), [3, 4, 11, 2])
  assert.equal(out.values[2].value, 'R')
})

test('numeric values sort by number and the list is capped', () => {
  const rows = [10, 9, 100, 1].map((n) => ({ attributes: { N: n } }))
  const out = rowsToValues(rows, 'N', null, new Map(), 'x', 'y', 3)
  same(out.values.map((v) => v.value), [1, 9, 10])
  assert.equal(out.truncated, true)
  assert.equal(out.values[0].count, undefined)
})

test('labels: domain name, raw value, blank and null', () => {
  const labels = new Map([['1', 'One']])
  assert.equal(labelFor(1, labels, 'none', 'blank'), 'One')
  assert.equal(labelFor('x', labels, 'none', 'blank'), 'x')
  assert.equal(labelFor('  ', labels, 'none', 'blank'), 'blank')
  assert.equal(labelFor(null, labels, 'none', 'blank'), 'none')
})

test('shown count', () => {
  same(shownCount(values('A', 'B', null), set('B')), { shown: 2, total: 3 })
})

test('only text and whole-number fields can be categories', () => {
  for (const t of ['string', 'small-integer', 'integer', 'big-integer', 'long']) assert.ok(isCategoryFieldType(t), t)
  for (const t of ['double', 'date', 'oid', 'geometry', 'guid', '']) assert.ok(!isCategoryFieldType(t), t)
})
