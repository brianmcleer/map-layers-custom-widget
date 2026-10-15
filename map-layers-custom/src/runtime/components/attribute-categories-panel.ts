/*
  Expand layers by attribute value: the panel under a layer in the list.

  One CategoryPanel per configured layer. It queries the distinct values of the configured
  field (one request, optionally a grouped count), draws them as check boxes inside a plain
  DOM element the LayerList shows as the item's panel content, and rewrites the layer's
  definitionExpression when a box changes. Plain DOM because the SDK LayerList owns the
  item markup; React does not reach inside it. Pure SQL and label logic lives in
  ../lib/attribute-categories.ts.
*/
import {
  buildCategoryExpression, categoryKey, domainLabels, rowsToValues, shownCount,
  type CategoryValue
} from '../lib/attribute-categories'

export interface CategoryPanelOptions {
  /** FeatureLayer, map service Sublayer, or any layer with definitionExpression and queryFeatures. */
  layer: any
  field: string
  showCounts: boolean
  max: number
  t: (id: string, values?: { [k: string]: any }) => string
  /** Called after each change the user makes (telemetry; the layer title only, never a value). */
  onChange?: (shown: number, total: number) => void
  onError?: (error: any) => void
}

const COUNT_FIELD = 'mlc_count'

export class CategoryPanel {
  readonly el: HTMLElement
  private readonly opts: CategoryPanelOptions
  private values: CategoryValue[] = []
  private readonly unchecked: Set<string> = new Set<string>()
  private base: string | null = null
  private lastApplied: string | null = null
  private isString = true
  private loaded = false
  private loading: Promise<void> | null = null
  private error = false
  private truncated = false
  private watchHandle: any = null
  private destroyed = false

  constructor (opts: CategoryPanelOptions) {
    this.opts = opts
    this.el = document.createElement('div')
    this.el.className = 'mlc-categories'
    this.el.setAttribute('role', 'group')
    this.el.setAttribute('aria-label', opts.t('categoriesAria', { field: opts.field }))
    this.el.style.cssText = 'padding:4px 0 6px 0;font-size:13px;line-height:1.5;color:var(--calcite-color-text-1, inherit)'
    this.captureBase()
    this.watchOutsideChanges()
    this.renderLoading()
  }

  /** The expression the layer had before this panel touched it. */
  private captureBase (): void {
    try {
      const current = this.opts.layer.definitionExpression
      this.base = typeof current === 'string' && current.trim() ? current : null
    } catch (e) { this.base = null }
    this.lastApplied = this.base
  }

  /**
   * Another widget (the Filter widget, say) may rewrite definitionExpression while the panel
   * is up. Adopt that as the new base and put the unchecked values back on top of it.
   */
  private watchOutsideChanges (): void {
    const layer = this.opts.layer
    if (!layer || typeof layer.watch !== 'function') return
    try {
      this.watchHandle = layer.watch('definitionExpression', (next: string) => {
        if (this.destroyed) return
        const normalized = typeof next === 'string' && next.trim() ? next : null
        if (normalized === this.lastApplied) return
        this.base = normalized
        this.apply()
      })
    } catch (e) { /* layer does not support watch */ }
  }

  /** Loads the values once. Safe to call again: a second call waits on the first. */
  load (): Promise<void> {
    if (this.loaded) return Promise.resolve()
    if (this.loading) return this.loading
    this.loading = this.query().then((values) => {
      if (this.destroyed) return
      this.values = values
      this.loaded = true
      this.render()
    }).catch((e) => {
      if (this.destroyed) return
      this.error = true
      this.render()
      if (this.opts.onError) this.opts.onError(e)
    }).then(() => { this.loading = null })
    return this.loading
  }

  private async query (): Promise<CategoryValue[]> {
    const layer = this.opts.layer
    const field = this.opts.field
    if (layer.load && layer.loadStatus !== 'loaded') await layer.load()
    const fields: any[] = Array.isArray(layer.fields) ? layer.fields : (layer.fields && layer.fields.toArray ? layer.fields.toArray() : [])
    const fieldInfo = fields.find((f: any) => f && typeof f.name === 'string' && f.name.toLowerCase() === field.toLowerCase())
    if (!fieldInfo) throw new Error(`field not found: ${field}`)
    this.isString = String(fieldInfo.type) === 'string'
    const labels = domainLabels(fieldInfo.domain)
    const query: any = typeof layer.createQuery === 'function' ? layer.createQuery() : {}
    query.where = this.base || '1=1'
    query.returnGeometry = false
    query.outFields = [fieldInfo.name]
    query.orderByFields = [fieldInfo.name]
    let countField: string | null = null
    if (this.opts.showCounts) {
      const oid = typeof layer.objectIdField === 'string' && layer.objectIdField ? layer.objectIdField : fieldInfo.name
      query.groupByFieldsForStatistics = [fieldInfo.name]
      query.outStatistics = [{ statisticType: 'count', onStatisticField: oid, outStatisticFieldName: COUNT_FIELD }]
      countField = COUNT_FIELD
    } else {
      query.returnDistinctValues = true
    }
    const result = await layer.queryFeatures(query)
    const rows: any[] = result && Array.isArray(result.features) ? result.features : []
    const t = this.opts.t
    const out = rowsToValues(rows, fieldInfo.name, countField, labels, t('categoriesNoValue'), t('categoriesEmptyValue'), this.opts.max)
    this.truncated = out.truncated
    return out.values
  }

  /** Writes the expression for the current check state to the layer. */
  private apply (): void {
    const expr = buildCategoryExpression(this.base, this.opts.field, this.isString, this.values, this.unchecked)
    const next = expr || null
    this.lastApplied = next
    try {
      const layer = this.opts.layer
      if (layer && !layer.destroyed && (layer.definitionExpression || null) !== next) layer.definitionExpression = next
    } catch (e) { if (this.opts.onError) this.opts.onError(e) }
  }

  /** Puts the layer back the way the web map left it. Called on unmount and when the option goes off. */
  restore (): void {
    this.unchecked.clear()
    this.lastApplied = this.base
    try {
      const layer = this.opts.layer
      if (layer && !layer.destroyed && (layer.definitionExpression || null) !== this.base) layer.definitionExpression = this.base
    } catch (e) { /* noop */ }
  }

  destroy (): void {
    this.destroyed = true
    if (this.watchHandle && typeof this.watchHandle.remove === 'function') {
      try { this.watchHandle.remove() } catch (e) { /* noop */ }
    }
    this.watchHandle = null
    this.restore()
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el)
  }

  private renderLoading (): void {
    this.el.innerHTML = ''
    const p = document.createElement('div')
    p.style.cssText = 'padding:2px 0 2px 32px;color:var(--calcite-color-text-3, inherit)'
    p.textContent = this.opts.t('categoriesLoading')
    this.el.appendChild(p)
  }

  private setChecked (key: string, checked: boolean): void {
    if (checked) this.unchecked.delete(key); else this.unchecked.add(key)
  }

  private afterChange (): void {
    this.apply()
    this.render()
    const { shown, total } = shownCount(this.values, this.unchecked)
    if (this.opts.onChange) this.opts.onChange(shown, total)
  }

  private render (): void {
    const t = this.opts.t
    this.el.innerHTML = ''
    if (this.error) {
      const p = document.createElement('div')
      p.style.cssText = 'padding:2px 0 2px 32px;color:var(--calcite-color-text-3, inherit)'
      p.textContent = t('categoriesError')
      this.el.appendChild(p)
      return
    }
    if (this.values.length === 0) {
      const p = document.createElement('div')
      p.style.cssText = 'padding:2px 0 2px 32px;color:var(--calcite-color-text-3, inherit)'
      p.textContent = t('categoriesNone')
      this.el.appendChild(p)
      return
    }

    // Header row: All, None, and the "n of m shown" summary.
    const head = document.createElement('div')
    head.style.cssText = 'display:flex;align-items:center;gap:10px;padding:0 8px 4px 32px;font-size:12px'
    const link = (label: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.style.cssText = 'border:none;background:transparent;padding:0;cursor:pointer;font:inherit;text-decoration:underline;color:var(--calcite-color-brand, var(--calcite-ui-brand, #0079c1))'
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick() })
      return b
    }
    head.appendChild(link(t('categoriesAll'), () => { this.unchecked.clear(); this.afterChange() }))
    head.appendChild(link(t('categoriesNoneLink'), () => { this.values.forEach((v) => this.unchecked.add(categoryKey(v.value))); this.afterChange() }))
    const summary = document.createElement('span')
    const { shown, total } = shownCount(this.values, this.unchecked)
    summary.textContent = t('categoriesShown', { shown: String(shown), total: String(total) })
    summary.style.cssText = 'margin-left:auto;color:var(--calcite-color-text-3, inherit)'
    summary.setAttribute('role', 'status')
    head.appendChild(summary)
    this.el.appendChild(head)

    const list = document.createElement('div')
    list.style.cssText = 'display:flex;flex-direction:column'
    for (const v of this.values) {
      const key = categoryKey(v.value)
      const row = document.createElement('label')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:2px 8px 2px 32px;cursor:pointer;margin:0'
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = !this.unchecked.has(key)
      box.style.cssText = 'margin:0;flex-shrink:0;accent-color:var(--calcite-color-brand, var(--calcite-ui-brand, #0079c1))'
      box.setAttribute('aria-label', v.count !== undefined ? `${v.label} (${v.count})` : v.label)
      box.addEventListener('click', (e) => { e.stopPropagation() })
      box.addEventListener('change', () => { this.setChecked(key, box.checked); this.afterChange() })
      const text = document.createElement('span')
      text.textContent = v.label
      text.title = v.label
      text.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
      row.appendChild(box)
      row.appendChild(text)
      if (v.count !== undefined) {
        const n = document.createElement('span')
        n.textContent = String(v.count)
        n.style.cssText = 'font-size:12px;color:var(--calcite-color-text-3, inherit);flex-shrink:0'
        row.appendChild(n)
      }
      row.addEventListener('click', (e) => { e.stopPropagation() })
      list.appendChild(row)
    }
    this.el.appendChild(list)

    if (this.truncated) {
      const note = document.createElement('div')
      note.style.cssText = 'padding:4px 8px 0 32px;font-size:12px;color:var(--calcite-color-text-3, inherit)'
      note.textContent = t('categoriesTruncated', { max: String(this.values.length) })
      this.el.appendChild(note)
    }
  }
}
