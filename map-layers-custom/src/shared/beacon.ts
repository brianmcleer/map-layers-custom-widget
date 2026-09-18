/*
  beacon.ts  -  usage and error telemetry for the GIS Division's Experience Builder widgets.
  City of Grand Junction GIS Division. Shared file: the master lives in
  client\your-extensions\widgets\_shared\beacon.ts and sync-shared.ps1 copies it byte for
  byte into every widget's src\shared\. Never edit a widget's copy; edit the master and re-sync.

  What it records (one row per event, no personal data):
    app_id, app_name, widget_name, widget_version, action, detail, error_text, host, browser,
    session_id (random per page load), occurred_at.
  It never records usernames, coordinates, addresses, attribute values or URLs with query
  strings. Errors are truncated and stripped of token= parameters before they leave the page.

  Where it posts. The widget asks the app's portal, once per page load, for a public item
  tagged exb-beacon-sink (typeKeywords) and posts applyEdits adds to that item's table
  (layer 0). No sink item means telemetry is off, so a downstream install of this widget
  sends nothing anywhere unless that organization publishes its own sink. The lookup result
  is cached in sessionStorage for the page session.

  Off switches, any one is enough: the builder sets telemetry: false in the widget config;
  the browser sends Do Not Track; window.__exbBeaconDisabled = true; no sink item exists.

  Use, from widget.tsx:
    import { beacon } from '../shared/beacon'
    const b = beacon.init(props)                 // once per widget instance (componentDidMount or a mount effect); posts "open"
    b.action('export-pdf')                       // key actions, short stable names, optional detail string
    b.error(err, 'export-pdf')                   // caught errors
  Unhandled errors and promise rejections are captured once per page and attributed to a
  widget when the stack names its dist folder.

  Esri's own widgets are tracked as well. Once any City widget has called init, the module
  watches the app store: every out-of-the-box widget in the app (uri widgets/common/...,
  widgets/arcgis/..., widgets/layout/...) gets one "loaded" row per page load, and an "open"
  row each time its runtime state becomes OPENED (widget controller, sidebar, and so on).
  widget_name is Esri's manifest name (legend, print, map-layers, ...) and widget_version is
  the Experience Builder version. An app with no City widget at all runs none of this code.

  Fire and forget: events queue and flush every 10 seconds, at 20 events, and on pagehide via
  navigator.sendBeacon. Nothing here can throw into the widget; every path is try/catch.
*/

import { getAppStore } from 'jimu-core'

export const BEACON_TAG = 'exb-beacon-sink'
export const BEACON_VERSION = '1.1.1'

export interface BeaconHandle {
  /** Record a key action. Keep names short and stable ("open", "export-pdf", "search"). */
  action: (name: string, detail?: string) => void
  /** Record a caught error with optional context. */
  error: (err: unknown, detail?: string) => void
  /** Manifest name of the widget this handle belongs to. */
  widget: string
}

interface BeaconEvent {
  app_id: string
  app_name: string
  widget_name: string
  widget_version: string
  action: string
  detail: string
  error_text: string
  host: string
  browser: string
  session_id: string
  beacon_version: string
  occurred_at: number
}

interface BeaconState {
  sinkUrl: string | null | undefined   // undefined = not looked up yet, null = none / disabled
  lookup: Promise<string | null> | null
  queue: BeaconEvent[]
  timer: any
  sessionId: string
  widgets: Record<string, string>      // widget name -> version, for stack attribution
  installed: boolean
  errorsSent: number
  disabled: boolean
}

const FLUSH_MS = 10000
const FLUSH_AT = 20
const MAX_ERRORS_PER_SESSION = 25
const DETAIL_MAX = 250
const ERROR_MAX = 1000
const STORAGE_KEY = 'exbBeacon.sink'

const win: any = typeof window !== 'undefined' ? window : {}

function state (): BeaconState {
  if (!win.__exbBeacon) {
    win.__exbBeacon = {
      sinkUrl: undefined,
      lookup: null,
      queue: [],
      timer: null,
      sessionId: randomId(),
      widgets: {},
      installed: false,
      errorsSent: 0,
      disabled: false
    } as BeaconState
  }
  return win.__exbBeacon as BeaconState
}

function randomId (): string {
  try {
    const c: any = win.crypto
    if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 16)
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(8)
      c.getRandomValues(bytes)
      let hex = ''
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0')
      return hex
    }
  } catch (e) { /* fall through */ }
  // No Web Crypto at all (a browser far older than Experience Builder supports). This id only
  // groups one page load's events for counting; it is never a secret, a key or a credential.
  // Math.random is deliberately not used here: CodeQL flags it as insecure randomness.
  let tail = ''
  try { tail = Math.floor((win.performance?.now?.() ?? 0) * 1000).toString(36) } catch (e) { tail = '' }
  return Date.now().toString(36) + tail
}

function clip (s: any, max: number): string {
  const t = s == null ? '' : String(s)
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

/** Remove anything that could carry a credential or a person: tokens, query strings, emails. */
function scrub (s: string): string {
  return s
    .replace(/([?&])token=[^&\s]*/gi, '$1token=REDACTED')
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s]*/gi, '$1')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'EMAIL')
}

function browserFamily (): string {
  try {
    const ua: string = win.navigator?.userAgent ?? ''
    if (/Edg\//.test(ua)) return 'Edge'
    if (/OPR\//.test(ua)) return 'Opera'
    if (/Chrome\//.test(ua)) return 'Chrome'
    if (/Firefox\//.test(ua)) return 'Firefox'
    if (/Safari\//.test(ua)) return 'Safari'
    return 'Other'
  } catch (e) { return 'Other' }
}

function appInfo (): { id: string; name: string; portalUrl: string } {
  try {
    const s: any = getAppStore().getState()
    const id: string = s?.appId ?? ''
    const name: string = s?.appConfig?.attributes?.title ?? ''
    const portalUrl: string = s?.portalUrl ?? ''
    return { id: String(id), name: clip(name, 100), portalUrl: String(portalUrl) }
  } catch (e) { return { id: '', name: '', portalUrl: '' } }
}

function isDisabled (config: any): boolean {
  try {
    if (state().disabled || win.__exbBeaconDisabled === true) return true
    if (config && config.telemetry === false) return true
    const dnt = win.navigator?.doNotTrack ?? win.doNotTrack
    if (dnt === '1' || dnt === 'yes') return true
    // The builder is not a user; do not count edits in Experience Builder itself.
    const s: any = getAppStore().getState()
    if (s?.appRuntimeInfo?.appMode === 'DESIGN') return true
  } catch (e) { /* ignore */ }
  return false
}

/** Find the sink table once per page load: a public item tagged exb-beacon-sink on the app's portal. */
function resolveSink (): Promise<string | null> {
  const st = state()
  if (st.sinkUrl !== undefined) return Promise.resolve(st.sinkUrl)
  if (st.lookup) return st.lookup
  st.lookup = (async () => {
    try {
      const cached = win.sessionStorage?.getItem(STORAGE_KEY)
      if (cached) { st.sinkUrl = cached === 'none' ? null : cached; return st.sinkUrl }
    } catch (e) { /* private browsing */ }
    let url: string | null = null
    try {
      const portal = appInfo().portalUrl.replace(/\/+$/, '')
      if (portal) {
        const q = encodeURIComponent(`typekeywords:"${BEACON_TAG}"`)
        const res = await fetch(`${portal}/sharing/rest/search?f=json&num=1&q=${q}`, { credentials: 'omit' })
        const json: any = await res.json()
        const item = json?.results?.[0]
        if (item?.url) url = String(item.url).replace(/\/+$/, '') + '/0'
      }
    } catch (e) { url = null }
    st.sinkUrl = url
    try { win.sessionStorage?.setItem(STORAGE_KEY, url ?? 'none') } catch (e) { /* ignore */ }
    return url
  })()
  return st.lookup
}

function encodeAdds (events: BeaconEvent[]): string {
  const adds = events.map((e: BeaconEvent) => ({ attributes: e }))
  return 'f=json&rollbackOnFailure=false&adds=' + encodeURIComponent(JSON.stringify(adds))
}

function flush (useBeacon: boolean): void {
  const st = state()
  if (st.timer) { clearTimeout(st.timer); st.timer = null }
  if (st.queue.length === 0) return
  const batch = st.queue.splice(0, st.queue.length)
  resolveSink().then((url: string | null) => {
    if (!url) return
    const body = encodeAdds(batch)
    const endpoint = `${url}/applyEdits`
    try {
      if (useBeacon && typeof win.navigator?.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/x-www-form-urlencoded' })
        if (win.navigator.sendBeacon(endpoint, blob)) return
      }
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        keepalive: true,
        credentials: 'omit'
      }).catch(() => { /* telemetry is best effort */ })
    } catch (e) { /* never surface */ }
  }).catch(() => { /* never surface */ })
}

function enqueue (e: BeaconEvent): void {
  const st = state()
  st.queue.push(e)
  if (st.queue.length >= FLUSH_AT) { flush(false); return }
  if (!st.timer) st.timer = setTimeout(() => { flush(false) }, FLUSH_MS)
}

function record (widget: string, version: string, action: string, detail?: string, errorText?: string): void {
  try {
    const app = appInfo()
    enqueue({
      app_id: app.id,
      app_name: app.name,
      widget_name: clip(widget, 100),
      widget_version: clip(version, 20),
      action: clip(action, 50),
      detail: clip(scrub(detail ?? ''), DETAIL_MAX),
      error_text: clip(scrub(errorText ?? ''), ERROR_MAX),
      host: clip(win.location?.hostname ?? '', 100),
      browser: browserFamily(),
      session_id: state().sessionId,
      beacon_version: BEACON_VERSION,
      occurred_at: Date.now()
    })
  } catch (e) { /* never surface */ }
}

function errorToText (err: unknown): string {
  try {
    if (!err) return 'unknown error'
    const anyErr: any = err
    const msg = anyErr.message ?? String(err)
    const stack = anyErr.stack ? String(anyErr.stack).split('\n').slice(0, 6).join(' | ') : ''
    return stack && stack.indexOf(msg) >= 0 ? stack : `${msg}${stack ? ' | ' + stack : ''}`
  } catch (e) { return 'unserializable error' }
}

/** Attribute an unhandled error to a widget when its dist folder shows up in the stack. */
function attribute (text: string): { widget: string; version: string } {
  const st = state()
  const names = Object.keys(st.widgets)
  for (const name of names) {
    if (text.indexOf(`/widgets/${name}/`) >= 0 || text.indexOf(`\\widgets\\${name}\\`) >= 0) {
      return { widget: name, version: st.widgets[name] }
    }
  }
  const m = /\/widgets\/(common|arcgis|layout)\/([\w-]+)\//.exec(text)
  if (m) return { widget: m[2], version: '' }
  return { widget: 'app', version: '' }
}

const OOTB_URI = /^widgets\/(common|arcgis|layout)\//

/** Count Esri's own widgets from the app store: "loaded" once per page, "open" on each OPENED transition. */
function observeAppWidgets (): void {
  try {
    const store: any = getAppStore()
    if (!store || typeof store.subscribe !== 'function') return
    const loaded: Record<string, boolean> = {}
    const wasOpen: Record<string, boolean> = {}
    const scan = (): void => {
      try {
        const s: any = store.getState()
        const widgets: any = s?.appConfig?.widgets ?? {}
        const rt: any = s?.widgetsRuntimeInfo ?? {}
        Object.keys(widgets).forEach((id: string) => {
          const w: any = widgets[id]
          const uri: string = String(w?.uri ?? '')
          if (!OOTB_URI.test(uri)) return
          const m: any = w?.manifest ?? {}
          const name: string = String(m.name ?? uri.replace(OOTB_URI, '').replace(/\/$/, ''))
          const version: string = String(m.version ?? m.exbVersion ?? '')
          if (!loaded[id]) { loaded[id] = true; record(name, version, 'loaded', uri) }
          const open = rt[id]?.state === 'OPENED'
          if (open && !wasOpen[id]) record(name, version, 'open', uri)
          wasOpen[id] = open
        })
      } catch (e) { /* never surface */ }
    }
    scan()
    store.subscribe(scan)
  } catch (e) { /* never surface */ }
}

function installGlobalHandlers (): void {
  const st = state()
  if (st.installed || typeof win.addEventListener !== 'function') return
  st.installed = true
  observeAppWidgets()
  const send = (err: unknown): void => {
    if (st.errorsSent >= MAX_ERRORS_PER_SESSION) return
    st.errorsSent++
    const text = errorToText(err)
    const who = attribute(text)
    record(who.widget, who.version, 'unhandled-error', undefined, text)
  }
  win.addEventListener('error', (ev: any) => { try { send(ev?.error ?? ev?.message) } catch (e) { /* ignore */ } })
  win.addEventListener('unhandledrejection', (ev: any) => { try { send(ev?.reason) } catch (e) { /* ignore */ } })
  win.addEventListener('pagehide', () => { try { flush(true) } catch (e) { /* ignore */ } })
  try {
    win.document?.addEventListener('visibilitychange', () => {
      if (win.document.visibilityState === 'hidden') { try { flush(true) } catch (e) { /* ignore */ } }
    })
  } catch (e) { /* ignore */ }
}

const noop: BeaconHandle = { action: () => {}, error: () => {}, widget: '' }

export const beacon = {
  /**
   * Register a widget instance and record "open". Pass the widget props (manifest and config
   * are read from them). Returns a handle whose methods never throw; when telemetry is off the
   * handle is a no-op.
   */
  init (props: any): BeaconHandle {
    try {
      const manifest: any = props?.manifest ?? {}
      const widget: string = String(manifest.name ?? props?.widgetName ?? 'unknown')
      const version: string = String(manifest.version ?? '')
      if (isDisabled(props?.config)) return { ...noop, widget }
      const st = state()
      st.widgets[widget] = version
      installGlobalHandlers()
      resolveSink().catch(() => null)
      record(widget, version, 'open')
      return {
        widget,
        action: (name: string, detail?: string) => { record(widget, version, name, detail) },
        error: (err: unknown, detail?: string) => {
          if (state().errorsSent >= MAX_ERRORS_PER_SESSION) return
          state().errorsSent++
          record(widget, version, 'error', detail, errorToText(err))
        }
      }
    } catch (e) { return noop }
  },

  /** Turn telemetry off for the rest of the page session (for example from a privacy toggle). */
  disable (): void {
    try { state().disabled = true; state().queue.length = 0 } catch (e) { /* ignore */ }
  },

  /** Point at a sink table directly instead of searching the portal (tests, or a fixed URL). */
  configure (sinkTableUrl: string | null): void {
    try { state().sinkUrl = sinkTableUrl ? sinkTableUrl.replace(/\/+$/, '') : null } catch (e) { /* ignore */ }
  },

  /** Send whatever is queued now. */
  flush (): void { try { flush(false) } catch (e) { /* ignore */ } }
}

export default beacon
