# Map Layers (Custom) — customization notes

A fork of Esri's Experience Builder **Map Layers** widget with extra
operational features. All additions are behind config switches and default to
**off**, so existing deployments behave exactly as before until you opt in.

## What's new in this version (1.19.1)

### Carried over from the previous fork
- **Auto-include new sub-layers** — designate a group layer and any sub-layers
  added to it in the web map appear automatically in the deployed app, with no
  rebuild/republish. Configured per map view under *Source → customize layers →
  Auto-include new sub-layers*.

### Added in this version
- **Show only this layer (solo / isolate)** — a per-layer action that switches
  every other operational layer off in one click. Setting: *Enhanced options →
  "Show only this layer" action*.
- **Saved layer views** — end users capture the current on/off combination of
  layers as a named "view" (e.g. *Flood scenario*, *Zoning*) and re-apply it
  later from a bookmark dropdown in the header. Views persist in the browser
  (`localStorage`) per widget + map view. Setting: *Enhanced options → Enable
  saved layer views*.
- **"Visible only" filter** — a toggle in the batch-options menu that filters
  the list down to the layers currently switched on; combines with the text
  filter. Requires *Enable layer batch options*.
- **Live visible-layer count badge** — a Leaflet-style "N / M" badge in the
  header showing how many layers are switched on. Setting: *Enhanced options →
  Show a visible-layer count badge*. Updates live as layers toggle, including
  layers added at runtime.
- **Collapsible layer list** — collapse the whole list down to the header bar
  (and optionally start collapsed on load). Settings: *Enhanced options → Allow
  collapsing the layer list* and *Start collapsed when the app loads*.
- **Better filtering** — the filter box placeholder is now configurable and
  localized, the predicate is null-safe for group/table/runtime items, and a
  live *"N matches"* hint appears while filtering. Setting: *Enhanced options →
  Filter box placeholder text* (requires *Search layers* on).
- **Two new batch tools** (under the existing *Enable layer batch options*):
  - **Zoom to visible layers** — fit the view to the combined extent of all
    currently-visible layers.
  - **Reset to default visibility** — restore every layer to the visibility it
    had when the app loaded.

## New config flags (`src/config.ts`)

| Flag | Type | Default | Effect |
|------|------|---------|--------|
| `soloLayer` | boolean | off | Adds the "Show only this layer" list-item action |
| `showLayerCount` | boolean | off | Shows the live visible-layer count badge |
| `enableLayerViews` | boolean | off | Adds the saved-views (bookmark) control |
| `collapsibleList` | boolean | off | Adds the collapse/expand control |
| `startCollapsed` | boolean | off | List starts collapsed (needs `collapsibleList`) |
| `filterPlaceholder` | string | "" | Custom filter box placeholder (falls back to localized default) |

## Files touched
`src/config.ts`, `src/runtime/actions/constants.ts`, `src/runtime/actions/solo.ts` (new),
`src/runtime/actions/index.ts`, `src/runtime/widget.tsx`,
`src/runtime/components/map-layers-header.tsx`,
`src/runtime/components/layer-views.tsx` (new), `src/runtime/lib/style.ts`,
`src/runtime/translations/default.ts`, `src/setting/setting.tsx`,
`src/setting/lib/style.ts`, `src/setting/translations/default.ts`, `manifest.json`.

## Build note
This archive ships **source only** (no `dist/`). The prebuilt `dist/` from the
prior version no longer matches this source, so it was removed to avoid stale
runtime behavior. Drop this folder into your Experience Builder
`client/your-extensions/widgets/` directory and run your normal build
(`npm start` for dev, `npm run build:prod` for production) to regenerate
`dist/`. Non-English locale strings for the new keys fall back to English until
translated in `src/**/translations/<locale>.js`.
