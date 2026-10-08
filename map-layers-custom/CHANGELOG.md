# Changelog

Newest first. Every release bumps `manifest.json` and `package.json` together.

## 1.47.0 (2026-09-30)

- Added: **layer status heartbeat** for City Map Beacon. Each open page sends one `layers-status` row about 10 seconds after the list is ready, then on the health check interval (default 5 minutes), only while the page is visible, and an unchanged status at most every 15 minutes. Detail: `on 7 | down 0 | broken 1 | Water Mains; Parcels; ...` (counts, then the names of the layers drawing now, clipped to fit). The dashboard uses it to clear a restored layer or service at once and to show which layers are on right now. Rides on the layer telemetry switch (`telemetryLayers`).
- Changed: layer on and off rows are sent immediately instead of on the beacon's 10 second batch, so they reach the dashboard's Right now feed within seconds.

## 1.46.0 (2026-09-30)

- Added: **broken layer reports** (`reportBrokenLayers`, on by default, under Enhanced options next to the layer telemetry switch). One `layer-broken` row per layer per page load, detail `Group > Layer | reason`: a layer whose load fails (not authorized, not found, server error, timed out, with the HTTP status), a layer that loads but cannot draw (`layerview-create-error`), and, when the layer health check is on, a map service sublayer the service no longer lists. The reason is a short category, never the raw message, so no URLs or tokens reach the table. Basemap, hidden and draw layers are skipped, same as the on/off telemetry.

## 1.45.0 (2026-09-29)

- Changed: **layer telemetry covers every depth.** The on/off watcher now sits on the map, not on the list items: `map.allLayers` (flattened across group layers) plus each layer's sublayers walked recursively (map image, tile, WMS, KML), with collection watchers so layers and sublayers added later count too. Before, only leaf list items were reported, and children the list had not built yet (collapsed groups, lazily loaded sublayers, `hide-children` layers) were missed.
- Changed: rows carry the path, `Utilities > Water > Water Mains`, so two layers with the same name in different groups stay apart. City Map Beacon 1.12 splits it into Layer and Group. Group layers switched on by a user count too; groups turned on automatically because a child was switched on (auto show parents) do not.
- Skipped as before: basemap layers, `listMode: hide` layers, the draw layers. Batch rule (more than five in 600 ms is one `layers-batch` row) and the load-time quiet window unchanged.

## 1.44.0 (2026-09-29)

Ideas borrowed from osmlab/editor-layer-index and Esri's 3.x arcgis-dijit-layer-list.

- Added: **Imagery nearby** tab in the Add layer panel (`enableImageryIndex`, `imageryIndexUrl`). Reads the OSM Editor Layer Index (GeoJSON, once per page through `esri/request`), projects the view extent to WGS84 with `projectOperator`, and lists the TMS and WMS sources covering it: regional before worldwide, "best" first, searchable by name, top 80. Add builds a `WebTileLayer` (`{zoom}/{x}/{y}` and `{switch:a,b}` templates converted; flipped-y and quadkey templates skipped) or a `WMSLayer` (base URL, LAYERS, FORMAT and VERSION parsed from the GetMap template), sets the attribution as `copyright`, and puts it at the bottom of the operational layers like a second basemap. License note shown in the tab. `src/runtime/lib/eli.ts`, tested. Beacon `add-imagery`.
- Added: **Clean layer names** (`cleanLayerNames`, `cleanNamePrefix`, `cleanNameTitleCase`). List titles get underscores turned to spaces, an optional case-insensitive prefix pattern stripped (for example `GJ_|sde\.`), and optional Title Case that leaves acronyms alone. Display only; the web map is untouched. The 3.x dijit's `removeUnderscores`, widened. `src/runtime/lib/display-title.ts` also owns the mark order: favorite star, then the service note.
- Added: **Favorites** (`enableFavorites`). Add to favorites / Remove from favorites in the layer menu; starred names carry ★ in the list; Show favorites only in batch options keeps starred layers and the groups above them. Per browser, per widget (`localStorage`). Beacon `favorite-add` / `favorite-remove`.
- Added: **Zoom until visible** extra tool (`toolZoomToScale`, on by default with the other extra tools). Offered only while the map is outside a layer's visible range; one click moves the map to a scale just inside it. Beacon `zoom-to-scale`.
- Help guide: menu lines for the two tools, find line for favorites, add and troubleshooting lines for imagery. Tests gain `favorites`, `imagery`, `zoomToScale` flags, five control names, and `tests/display-title.test.cjs`.

## 1.43.0 (2026-09-29)

- Added: **Preset views**. Under Enhanced options, "Preset views (built into the app)" lists presets per map view: turn on the layers you want in the builder's map, click Add preset from map, rename inline, Update from map, reorder, delete. Each preset stores the ids of the switchable layers that are on (`presetViews` config keyed by map view; not in the XML export, map specific). In the app they sit read-only at the top of the Saved views menu under a "Presets" heading; applying one switches the named layers on, every other switchable layer off, and turns on parent groups (the existing saved-view apply path). The bookmark button shows whenever presets exist, even with saved layer views off; with saved views off the menu holds presets only. Beacon `apply-preset` with the preset name.
- Help guide: the Saved views section explains presets and shows with either feature; bar line adapts. Tests gain a `presetViews` flag.

## 1.42.0 (2026-09-29)

- Added: **Search descriptions and tags too** (sub-switch under Search layers, `searchLayerDescriptions`). Once per list refresh the header builds an index from each layer's portal item (title, summary, description, tags) and service metadata (description, copyright), HTML stripped, six layers at a time. The filter box and the match count then match that text as well as the name; map service sublayers share their parent's text. `src/runtime/lib/search-index.ts`.
- Added: **Export layer list (CSV)** in batch options (`enableLayerCsv`, needs batch options). One row per list item including groups and sublayers: layer, group path, type, on, opacity, min and max scale, URL. Cells are quoted and leading `= + - @` are defused; UTF-8 BOM so Excel opens it cleanly. `src/runtime/lib/layer-csv.ts`.
- Added: **Layer health check** (`enableLayerHealth`, `layerHealthMinutes` default 5). Four seconds after the list loads and then on the timer, the widget asks each distinct service behind the list for `?f=json` through `esri/request` (sign-in and proxy rules apply; not the global fetch the CityMap shim intercepts), four at a time with a 10 second timeout. A service that errors or times out marks its layers "(service not answering)" in the list, kept across list rebuilds, and reports `layer-unreachable` to the telemetry once; recovery clears the mark and reports `layer-recovered`. Basemap layers, group layers and the draw layer are skipped. Timer stops on unmount.
- Help guide: find, layers, batch and troubleshooting lines for the three features. Tests gain `searchDeep`, `layerCsv`, `layerHealth` flags plus `tests/layer-csv.test.cjs`.

## 1.41.0 (2026-09-29)

- Added: **Copy link to these layers** in the batch options menu (Enhanced options switch `enableShareLink`, needs layer batch options). Copies the page address with `?mlc=<layer ids>` naming the layers that are on. On load the widget reads the parameter once, switches those layers on and every other switchable layer off, turns on their parent groups, and ignores ids the map does not have. The address bar is never rewritten by the widget. A short "Link copied" note shows beside the menu. `src/runtime/lib/share-link.ts` holds the pure functions; `tests/share-link.test.cjs` covers them.
- Added: layer on and off clicks go to the usage telemetry as `layer-on` / `layer-off` rows with the layer title (never attribute values). Changes are buffered for 600 ms; a burst of more than five (batch action, saved view, share link) becomes one `layers-batch` row with the counts, and the widget's own load-time changes are not counted. Switch `telemetryLayers` (default on) under Enhanced options; the beacon's own off switches still apply. New beacon actions: `copy-share-link`, `open-share-link`.
- Help guide: batch line and tip for Copy link, a "Where things live" line and a troubleshooting line. Tests gain a `shareLink` flag and the control name.

## 1.40.0 (2026-09-29)

- Added: **Pick one layer per group (radio buttons)**. Enhanced options gains a switch plus a per-map-view list of the web map's group layers. Each group switched on runs in the Maps SDK's exclusive visibility mode, so only one of its layers can be on at a time; with "Use tick boxes" on, the layer list draws those layers with round buttons instead of boxes, and with eye icons the group still allows only one. On load the widget trims a configured group to a single visible layer (the one highest in the list) before switching the mode. Groups removed from the list, and every group on unmount, go back to the visibility mode the web map gave them. Config: `enablePickOneGroups` (portable in the XML export) and `pickOneGroupIds` keyed by map view (not exported, map specific).
- Help guide: the "Turning layers on and off" section explains pick-one groups (wording follows the tick box setting) and troubleshooting covers a layer switching off by itself. Test suite gains a `pickOne` flag and a wording test.
- Settings: the group walk is now a shared `collectParentLayers` helper used by both the auto-include list and the pick-one list.

## 1.39.5 (2026-09-22)

- Fixed: "Cannot read properties of null (reading 'appendChild')" in `createLayerList` (94 beacon reports on 1.39.3 across six apps, Sept 19 to 22). The layer list builds asynchronously; when the widget closed or its page changed before the LayerList module and view finished loading, the build wrote into a container React had already removed. The build now checks the container after every await and stops quietly if it is gone. Same guard on the table list.
- Fixed: the widget had no unmount cleanup. It now cancels the pending refresh timer, removes the map's layer-view listener and the reparent watcher, and destroys the LayerList and TableList when it unmounts, so reopening a panel no longer stacks listeners on the view.
- The deferred refresh in `componentDidUpdate` is debounced, so a burst of prop updates schedules one rebuild instead of several racing ones.

## 1.39.4 (2026-09-18)

- Settings: a **Show help guide** option. Turn it off and the question-mark button and the first-run hint both disappear; the guide itself is untouched. Undefined means on, so apps configured before this release keep their help button.

## 1.39.3 (2026-09-18)

- Security: the beacon's session id now falls back to `crypto.getRandomValues` and then to a clock value instead of `Math.random`, which CodeQL flags as insecure randomness (shared beacon 1.1.1). The id only groups one page load's events; it is never a secret or a credential.
- Build: `tsconfig.json` is `jsx: react-jsx` with `jsxImportSource: @emotion/react`, matching the Experience Builder client. ts-loader reads the widget tsconfig, and the previous classic `jsx: react` setting made the settings panel and runtime fail with "Cannot convert undefined or null to object" after a full rebuild. No functional change.

## 1.39.2 (2026-09-18)

- Added: anonymous usage and error telemetry (shared beacon module; off unless the portal publishes an exb-beacon-sink table; telemetry: false in config disables it).

## 1.39.1 (2026-09-17)

- Packaging: the Visual Studio editor shims are no longer in the release zip. `publish.ps1` strips them from a staging copy (`$ReleaseOnlyExclude`) and refuses to zip if any ambient `declare module` of react, jimu or esri survives. The shims stay in the GitHub repo; clone users delete them before building.

## 1.39.0

### Added
- In-widget help guide (shared GIS Division pattern): Help button at the right of the header, searchable accordion guide with sections for turning layers on and off, finding a layer, the layer menu, the top bar, saved views, adding a layer, where things live, troubleshooting and tips. Every line is gated on the builder's switches and the map-widget mode, so the guide never mentions a control that is not on screen. First-run hint stored per browser under `mapLayersCustom.helpHintDismissed.<widgetId>`.
- `src/runtime/theme.ts`, `src/runtime/components/HelpPopup.tsx` and `src/runtime/components/FirstRunHint.tsx` copied unchanged from the widget family; `src/runtime/helpSections.ts` and the `help*` / `firstRun*` strings in `src/runtime/translations/default.ts` are the widget-specific parts.
- `tests/help-guide.test.cjs` and `tests/help-consistency.test.cjs` (plain Node, `node --test tests/*.cjs`).

### Changed
- The header bar now always renders once the list has loaded, because it carries the Help button. Before, it was hidden when no header option was switched on.
- Visual Studio setup moved to the self-contained mode for EB 1.21 (pnpm): `tsconfig.json` no longer uses `baseUrl`/`paths` or `react-jsx`, `src/exb-editor-shims.d.ts` is the copied family master, and `src/typings.d.ts` holds only this widget's extra declarations. `npx tsc -p .` reports 0 errors. Four type-only touch-ups in source for the same reason: `React` imported in `actions/remove.tsx`, `useDataSources`/`useMapWidgetIds` typed loosely on `WidgetProps`, and two `as any` casts in `setting.tsx`. The webpack build is unaffected.
- README: help guide feature line, Visual Studio section, Tests section.
- `.gitignore` / `.npmignore` exclude `Claude outputs/` and `*.zip`.
