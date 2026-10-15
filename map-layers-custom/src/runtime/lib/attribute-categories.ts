/*
  Expand layers by attribute value: the pure parts.

  A configured layer lists the distinct values of one field under its name. Unchecking a
  value hides those features by rewriting the layer's definitionExpression. This module
  owns the SQL that does it and the labels the list shows. No Experience Builder or
  ArcGIS imports, so tests/attribute-categories.test.cjs runs it in plain Node.
*/

/** One listed value. `value` is the raw attribute (null for features with no value). */
export interface CategoryValue {
  value: string | number | null
  label: string
  count?: number
}

/** Stable string key for a value, so a Set can hold numbers, strings and null alike. */
export const NULL_KEY = '\u0000null'

export function categoryKey (value: string | number | null | undefined): string {
  if (value === null || value === undefined) return NULL_KEY
  return String(value)
}

/** Field types the panel can list. Doubles and dates make poor categories. */
export const CATEGORY_FIELD_TYPES = ['string', 'small-integer', 'integer', 'big-integer', 'long']

export function isCategoryFieldType (type: string): boolean {
  return CATEGORY_FIELD_TYPES.indexOf(String(type || '')) !== -1
}

/** Quotes a value for a where clause. Strings get their single quotes doubled. */
export function sqlLiteral (value: string | number, isString: boolean): string {
  if (!isString) {
    const n = Number(value)
    return isFinite(n) ? String(n) : `'${String(value).replace(/'/g, "''")}'`
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

/** A field name quoted only when it needs it (spaces, odd characters). */
export function sqlField (field: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(field) ? field : `"${field.replace(/"/g, '""')}"`
}

/**
 * The definitionExpression for a layer given what the user unchecked.
 *
 * base: the expression the layer had before the panel touched it (null or '' for none).
 * Returns the base when nothing is unchecked, '1=0' when everything is, and otherwise the
 * base AND a NOT IN list (with IS NULL / IS NOT NULL handling when the "(no value)" row is
 * listed). Values the query did not list are never hidden: a feature with a value that
 * arrived after the list was built keeps drawing.
 */
export function buildCategoryExpression (
  base: string | null | undefined,
  field: string,
  isString: boolean,
  values: CategoryValue[],
  unchecked: Set<string>
): string {
  const trimmedBase = (base || '').trim()
  if (!unchecked || unchecked.size === 0) return trimmedBase
  const listed = values.filter((v) => unchecked.has(categoryKey(v.value)))
  if (listed.length === 0) return trimmedBase
  if (listed.length >= values.length && values.length > 0) {
    return trimmedBase ? `(${trimmedBase}) AND (1=0)` : '1=0'
  }
  const f = sqlField(field)
  const nullHidden = listed.some((v) => v.value === null || v.value === undefined)
  const hiddenLiterals = listed
    .filter((v) => v.value !== null && v.value !== undefined)
    .map((v) => sqlLiteral(v.value as string | number, isString))
  const parts: string[] = []
  if (hiddenLiterals.length > 0) {
    // NOT IN drops nulls by itself, so keep them with an OR unless they are hidden too.
    parts.push(nullHidden ? `${f} NOT IN (${hiddenLiterals.join(', ')})` : `(${f} NOT IN (${hiddenLiterals.join(', ')}) OR ${f} IS NULL)`)
  }
  if (nullHidden) parts.push(`${f} IS NOT NULL`)
  const filter = parts.join(' AND ')
  return trimmedBase ? `(${trimmedBase}) AND (${filter})` : filter
}

/** Coded value domain lookup: code -> name. Accepts the SDK's domain object or null. */
export function domainLabels (domain: any): Map<string, string> {
  const out = new Map<string, string>()
  const coded: any[] = domain && Array.isArray(domain.codedValues) ? domain.codedValues : []
  for (const cv of coded) {
    if (cv && cv.code !== undefined && cv.code !== null) out.set(String(cv.code), String(cv.name ?? cv.code))
  }
  return out
}

/** The text shown for a value: domain name when there is one, the value otherwise, nullLabel for null. */
export function labelFor (value: string | number | null | undefined, labels: Map<string, string>, nullLabel: string, emptyLabel: string): string {
  if (value === null || value === undefined) return nullLabel
  const s = String(value)
  if (labels.has(s)) return labels.get(s)
  if (s.trim() === '') return emptyLabel
  return s
}

/**
 * Turns query rows into the value list: distinct values, domain names applied, sorted by
 * label (null last), capped at `max`. Rows look like { attributes: { [field]: value, cnt?: n } }.
 */
export function rowsToValues (
  rows: Array<{ attributes: { [k: string]: any } }>,
  field: string,
  countField: string | null,
  labels: Map<string, string>,
  nullLabel: string,
  emptyLabel: string,
  max: number
): { values: CategoryValue[], truncated: boolean } {
  const seen = new Map<string, CategoryValue>()
  for (const row of rows || []) {
    const attrs = row && row.attributes ? row.attributes : {}
    // Services answer with the field's own casing; match either way.
    let raw: any = attrs[field]
    if (raw === undefined) {
      const k = Object.keys(attrs).find((n) => n.toLowerCase() === field.toLowerCase())
      raw = k ? attrs[k] : undefined
    }
    const value: string | number | null = (raw === undefined || raw === null) ? null : raw
    const key = categoryKey(value)
    const count = countField && typeof attrs[countField] === 'number' ? attrs[countField] : undefined
    if (seen.has(key)) {
      const prev = seen.get(key)
      if (count !== undefined) prev.count = (prev.count || 0) + count
      continue
    }
    const entry: CategoryValue = { value, label: labelFor(value, labels, nullLabel, emptyLabel) }
    if (count !== undefined) entry.count = count
    seen.set(key, entry)
  }
  const all = Array.from(seen.values())
  all.sort((a, b) => {
    const an = a.value === null
    const bn = b.value === null
    if (an !== bn) return an ? 1 : -1
    if (typeof a.value === 'number' && typeof b.value === 'number') return a.value - b.value
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
  })
  const cap = Math.max(1, Math.min(500, Math.round(Number(max)) || 50))
  return { values: all.slice(0, cap), truncated: all.length > cap }
}

/** Panel summary: "3 of 12 shown" style counts for the aria label and the header line. */
export function shownCount (values: CategoryValue[], unchecked: Set<string>): { shown: number, total: number } {
  const total = values.length
  const hidden = values.filter((v) => unchecked.has(categoryKey(v.value))).length
  return { shown: total - hidden, total }
}
