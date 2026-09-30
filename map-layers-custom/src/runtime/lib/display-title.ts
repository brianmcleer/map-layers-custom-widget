/*
  display-title.ts  -  how a layer's name is shown in the list.

  The web map's own titles are never changed; only the list item's title is. Cleaning
  (underscores to spaces, an optional prefix pattern removed, optional title case) comes from
  the old 3.x LayerList dijit's removeUnderscores option, widened. Marks are appended in a
  fixed order: favorite star first, then "(service not answering)". Pure, no Experience
  Builder imports, so tests/display-title.test.cjs runs it in plain Node.
*/

export interface CleanOptions {
  clean: boolean
  /** A regular expression source removed from the start of the name, case-insensitive. */
  prefix?: string
  titleCase?: boolean
}

const SMALL = new Set<string>(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs'])

export function titleCase (s: string): string {
  return s.split(' ').map((w: string, i: number) => {
    if (!w) return w
    // Leave acronyms and mixed-case words alone (GIS, McLeer, WiFi).
    if (w !== w.toLowerCase() && w !== w.toUpperCase()) return w
    if (w === w.toUpperCase() && w.length <= 4) return w
    const lower = w.toLowerCase()
    if (i > 0 && SMALL.has(lower)) return lower
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }).join(' ')
}

export function cleanTitle (title: string, opts: CleanOptions): string {
  let t = String(title ?? '')
  if (!opts || !opts.clean) return t
  if (opts.prefix) {
    try {
      const re = new RegExp('^(?:' + opts.prefix + ')', 'i')
      t = t.replace(re, '')
    } catch (e) { /* a bad pattern is ignored */ }
  }
  t = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (opts.titleCase) t = titleCase(t)
  return t || String(title ?? '')
}

export interface TitleMarks {
  favorite?: boolean
  unavailable?: string
}

export function decorateTitle (base: string, marks: TitleMarks): string {
  let t = base
  if (marks.favorite) t = `★ ${t}`
  if (marks.unavailable) t = `${t} (${marks.unavailable})`
  return t
}
