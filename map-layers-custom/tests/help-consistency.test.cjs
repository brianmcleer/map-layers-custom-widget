/*
  In-widget help guide: cross-widget consistency (WIDGETHANDOFF Sections 10.4, 10.9, 11.2).

  Asserts that the files copied from the widget family are still the family's files, that the
  visual spec rows from Section 10.4 are present, that no color is hard-coded in the guide, and
  that the Help button and first-run hint are wired the way every other widget wires them.

    node --test tests/*.cjs          (from the widget folder)

  The copied masters are pinned by SHA-256. When the family deliberately changes one of them,
  copy the new master in and update the hash here in the same commit; a hash mismatch with no
  such commit means this widget drifted. Set HELP_REFERENCE_WIDGET to a sibling widget folder
  (for example ../enhanced-measurement) to also diff the copies byte for byte against it.
*/
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const root = path.resolve(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const sha = (text) => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex')

const COPIED = {
  'src/runtime/theme.ts': '770c10b409ecc967eafe9e0744a1f4a759f05b834b8494aa4d9452bd43dc2ade',
  'src/runtime/components/HelpPopup.tsx': 'bf25e9d01b185c5f2b582a1a1cc3d028ffb1446955f4f9885871ad7661bede06',
  'src/runtime/components/FirstRunHint.tsx': 'c32f89f08661eb6f70f1b5be6ec32d0fb8ad341ec00c7d1c2bb147e899a20d0b',
  'src/exb-editor-shims.d.ts': '6d3757498b3467e902a6ea9b435cc2ce4a75d68ed99b84aaee9ad9e295344fd0'
}

test('copied family files are byte-identical to the masters', () => {
  for (const [rel, expected] of Object.entries(COPIED)) {
    assert.equal(sha(read(rel)), expected, `${rel} differs from the family master`)
  }
})

test('copied family files match the reference widget when one is given', (ctx) => {
  const ref = process.env.HELP_REFERENCE_WIDGET
  if (!ref) { ctx.skip('HELP_REFERENCE_WIDGET not set'); return }
  for (const rel of Object.keys(COPIED)) {
    const other = path.resolve(root, ref, rel)
    if (!fs.existsSync(other)) continue
    assert.equal(sha(read(rel)), sha(fs.readFileSync(other, 'utf8')), `${rel} differs from ${ref}`)
  }
})

test('HelpPopup carries every row of the 10.4 visual spec', () => {
  const src = read('src/runtime/components/HelpPopup.tsx')
  const rows = [
    '<Modal isOpen centered toggle={onClose} size="sm">',
    '<ModalHeader toggle={onClose}>{title}</ModalHeader>',
    "maxHeight: '70vh', overflowY: 'auto'",
    '<Button type="primary" onClick={onClose}>{closeLabel}</Button>',
    "margin: '0 0 12px 0', fontSize: '13px', color: tokens.text, lineHeight: 1.55",
    'allowClear',
    'aria-label={searchPlaceholder}',
    "marginBottom: '10px'",
    "fontSize: '13px', color: tokens.textSecondary }}>{noMatches}",
    "display: 'flex', flexDirection: 'column', gap: '6px'",
    'border: `1px solid ${isOpen ? tokens.primary : tokens.divider}`, borderRadius: tokens.radius, overflow: \'hidden\'',
    "padding: '9px 10px', border: 'none', background: isOpen ? tokens.infoBg : tokens.surface, color: tokens.text, cursor: 'pointer', fontSize: '13px', fontWeight: 600",
    'aria-expanded={isOpen}',
    '<CalciteIcon icon={s.icon} scale="s" />',
    "<CalciteIcon icon={isOpen ? 'chevron-up' : 'chevron-down'} scale=\"s\" />",
    "padding: '8px 12px 10px 12px', fontSize: '13px', lineHeight: 1.6, color: tokens.text",
    "margin: '0 0 6px 0', color: tokens.textSecondary",
    "margin: 0, paddingLeft: '20px'",
    "marginBottom: '6px'",
    "background: tokens.infoBg, color: tokens.text, padding: '0 1px', borderRadius: '2px'"
  ]
  rows.forEach((row) => { assert.ok(src.includes(row), `spec row missing: ${row}`) })
})

test('no hard-coded colors or inline svg in the guide files', () => {
  for (const rel of ['src/runtime/components/HelpPopup.tsx', 'src/runtime/components/FirstRunHint.tsx', 'src/runtime/helpSections.ts']) {
    const src = read(rel)
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, `hex color in ${rel}`)
    assert.doesNotMatch(src, /<svg/i, `inline svg in ${rel}`)
  }
})

test('Help button and first-run hint are wired the shared way', () => {
  const header = read('src/runtime/components/map-layers-header.tsx')
  assert.ok(header.includes('<Button size="sm" type="tertiary" icon onClick={onHelp} title={helpLabel} aria-label={helpLabel} style={{ flexShrink: 0 }}>'))
  assert.ok(header.includes('<CalciteIcon icon="question" scale="s" />'))

  const widget = read('src/runtime/widget.tsx')
  assert.ok(widget.includes("helpLabel={this.t('helpTitle')}"))
  assert.ok(widget.includes('<FirstRunHint'))
  assert.ok(widget.includes("this.t('firstRunTitle')") && widget.includes("this.t('firstRunBody')") && widget.includes("this.t('firstRunHelpLink')") && widget.includes("this.t('firstRunDismiss')"))
  assert.ok(widget.includes('mapLayersCustom.helpHintDismissed.${this.props.id}'), 'hint dismissal is namespaced by widget id')
  assert.ok(widget.includes("closeLabel={this.t('close')}"))
  /* Opening the guide dismisses the hint. */
  assert.match(widget, /openHelp = \(\): void => \{\s*if \(this\.state\.showFirstRunHint\) this\.dismissFirstRunHint\(\)/)
})

test('translations carry the shared keys', () => {
  const src = read('src/runtime/translations/default.ts')
  for (const k of ['helpTitle', 'close', 'helpIntro', 'helpSearchPlaceholder', 'helpNoMatches', 'helpAnd', 'firstRunTitle', 'firstRunBody', 'firstRunHelpLink', 'firstRunDismiss']) {
    assert.match(src, new RegExp(`^\\s*${k}: '`, 'm'), `missing key ${k}`)
  }
})
