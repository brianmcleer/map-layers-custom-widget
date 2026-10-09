/*
  layer-name-i18n.ts  -  layer names from the web map, shown in the app language.

  Display only: the layer's own title never changes, so search, popups, other widgets and
  saved views keep working on the web map names. Follows the app locale (?locale=xx, the
  browser, the user's ArcGIS profile, or the Language Switcher widget) and updates the list
  when it changes.

  Where a name comes from, first match wins:
    1. "Keep as is" list (proper nouns, acronyms): always the web map name.
    2. The builder's own translations (settings, stored in the app config).
    3. The shared translation memory (exb-i18n-kit on GitHub, or any URL with <locale>.json files).
    4. An optional LibreTranslate server for names nobody has translated yet (cached per page).
    5. The web map name.

  Pure, no Experience Builder imports, so it can be tested in plain Node.
*/

export const DEFAULT_MEMORY_URL = 'https://raw.githubusercontent.com/brianmcleer/exb-i18n-kit/translation-memory/memory'

export interface NameOptions {
  /** english name -> { locale -> translation } */
  overrides?: { [english: string]: { [locale: string]: string } }
  keep?: string[]
  useMemory?: boolean
  memoryUrl?: string
  mtUrl?: string
  mtApiKey?: string
}

/** EB locale ids as the memory files use them: es, pt-br, zh-cn, no. */
export function memoryLocale (locale: string): string {
  const l = String(locale || 'en').toLowerCase().replace('_', '-')
  if (l === 'nb' || l === 'nn' || l.startsWith('nb-')) return 'no'
  if (/^(pt-br|pt-pt|zh-cn|zh-tw|zh-hk)$/.test(l)) return l
  if (l === 'pt') return 'pt-br'
  if (l === 'zh') return 'zh-cn'
  return l.split('-')[0]
}

const norm = (s: string) => String(s || '').replace(/\s+/g, ' ').trim()
const fold = (s: string) => norm(s).toLowerCase()

// locale -> lower-cased english -> translation. Shared by every widget on the page.
const memoryCache = new Map<string, Promise<Map<string, string>>>()
const mtCache = new Map<string, string>() // `${loc}\u0000${english}` -> translation

/** Loads <url>/<locale>.json once per page (cached; failures give an empty map). */
export function loadMemory (url: string, locale: string): Promise<Map<string, string>> {
  const loc = memoryLocale(locale)
  const key = `${url}|${loc}`
  if (!memoryCache.has(key)) {
    const p = (async () => {
      const out = new Map<string, string>()
      if (loc === 'en' || typeof fetch !== 'function') return out
      try {
        const res = await fetch(`${String(url || DEFAULT_MEMORY_URL).replace(/\/+$/, '')}/${loc}.json`, { cache: 'default' })
        if (!res.ok) return out
        const json: any = await res.json()
        for (const en of Object.keys(json || {})) {
          const e = json[en]
          const t = typeof e === 'string' ? e : (e && typeof e.t === 'string' ? e.t : '')
          if (t && t.trim()) out.set(fold(en), t)
        }
      } catch (e) { /* offline or blocked: names stay as they are */ }
      return out
    })()
    memoryCache.set(key, p)
  }
  return memoryCache.get(key)
}

/** Translates the names a memory lookup missed with a LibreTranslate server; results cached per page. */
export async function machineTranslate (names: string[], locale: string, mtUrl: string, apiKey?: string): Promise<void> {
  const loc = memoryLocale(locale)
  const todo = Array.from(new Set(names.map(norm))).filter(n => n && !mtCache.has(`${loc}\u0000${n}`))
  if (!mtUrl || loc === 'en' || !todo.length || typeof fetch !== 'function') return
  try {
    const res = await fetch(`${mtUrl.replace(/\/+$/, '')}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: todo, source: 'en', target: loc.split('-')[0] === 'zh' ? (loc === 'zh-cn' ? 'zh' : 'zt') : loc.split('-')[0], format: 'text', api_key: apiKey || undefined })
    })
    if (!res.ok) return
    const json: any = await res.json()
    const out: string[] = Array.isArray(json?.translatedText) ? json.translatedText : [json?.translatedText]
    todo.forEach((n, i) => { if (typeof out[i] === 'string' && out[i].trim()) mtCache.set(`${loc}\u0000${n}`, out[i]) })
  } catch (e) { /* server down: names stay as they are */ }
}

/** The name to show for one web map title in the given locale. */
export function translateName (name: string, locale: string, opts: NameOptions, memory?: Map<string, string>): string {
  const n = norm(name)
  const loc = memoryLocale(locale)
  if (!n || loc === 'en') return name
  if ((opts.keep || []).some(k => fold(k) === fold(n))) return name
  const ov = opts.overrides || {}
  for (const en of Object.keys(ov)) {
    if (fold(en) !== fold(n)) continue
    const per = ov[en] || {}
    const hit = per[loc] ?? per[locale] ?? per[String(locale).toLowerCase()]
    if (typeof hit === 'string' && hit.trim()) return hit
  }
  if (opts.useMemory !== false && memory) {
    const hit = memory.get(fold(n))
    if (hit) return hit
  }
  const mt = mtCache.get(`${loc}\u0000${n}`)
  return mt || name
}

/** A file the shared memory can read: register its raw URL in exb-i18n-kit memory/sources.json. */
export function namesAsDefaultTs (names: string[]): string {
  const uniq = Array.from(new Set(names.map(norm).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const key = (s: string, i: number) => 'layer' + (i + 1)
  const esc = (s: string) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
  return 'export default {\n' + uniq.map((s, i) => `  ${key(s, i)}: ${esc(s)}`).join(',\n') + '\n}\n'
}
