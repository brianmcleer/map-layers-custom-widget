# Map Layers Custom (ArcGIS Experience Builder widget)

A customized version of Esri's Map Layers widget for ArcGIS Experience Builder. It keeps everything the stock widget does and adds layer management, data tools, and quality-of-life features for municipal GIS workflows.

## Features

- Auto-include new sub-layers. Designate a parent group so layers added to it later appear automatically in deployed apps, with no whitelist edits or redeploy.
- Layer focus (isolate). Show only the chosen layer or service sub-layer and hide everything else, with a clear exit. Works on real layers and on map-service sub-layers.
- Live visible-layer count badge.
- Collapsible layer list with an optional start-collapsed state.
- Add data. A tabbed panel for adding a layer by URL (ArcGIS service, vector tile, WMS, WMTS, GeoJSON, CSV, KML) or by local file (GeoJSON, CSV, KML, and zipped shapefile).
- Master opacity. A popover slider that sets opacity across all layers at once.
- Basemap switcher using your organization's basemaps.
- Legend panel.
- Saved views, with export and import to JSON.
- Enhanced search and filtering, including a match count that includes service sub-layers, plus a visible-only filter.
- Batch tools: turn all on or off, reset visibility, zoom to visible, export the map image, and expand or collapse all.
- Per-layer tools: flash, copy URL, refresh, layer details, move to top or bottom, and move out of group, each individually toggleable.

## Requirements

- ArcGIS Experience Builder Developer Edition 1.19 or 1.20 (built and tested on these; they run React 19).
- Experience Builder 1.18 and earlier run React 18 and are not supported.

## Install

1. Download the release zip and extract it.
2. Copy the `map-layers-custom` folder into your Experience Builder client extensions folder so that `manifest.json` sits directly inside:

   ```
   client/your-extensions/widgets/map-layers-custom/manifest.json
   ```

   Do not nest it a second level deep (for example `widgets/map-layers-custom/map-layers-custom/`). A second-level nest is the usual reason a widget does not register.
3. From the `client` folder, run `npm install`. Experience Builder installs this widget's dependencies automatically from its `package.json`, so there are no per-dependency commands to run.
4. Start or restart the client (`npm start`), then hard-refresh the builder (Ctrl+Shift+R).

The widget then appears in the builder's widget panel as "Map Layers Custom."

## Troubleshooting: `map-layers-custom is duplicated`

This means the widget name is registered more than once, so a second copy is present somewhere in the install. Replacing just one folder does not fix it. Check, in order:

1. A nested folder: `widgets/map-layers-custom/map-layers-custom/`. The manifest must sit directly inside the widget folder, not a second level deep.
2. A leftover folder from an earlier build or version, including any `-copy` folder or a folder under a previous name.
3. A stale compiled build in `client/dist/widgets`. Stop the client, delete the matching folder under `dist/widgets` (or run a clean build), then start again. This is common after moving a widget between EB versions.

If removing one copy makes the widget disappear from the Entrypoint list entirely, the copy that remains is nested too deep. Move it so the manifest is directly inside the widget folder.

## Feedback

Questions and issues are welcome on the Esri Community Experience Builder Custom Widgets board, or as a GitHub issue on this repository.

## Credits and license

This widget is a derivative work based on Esri's ArcGIS Experience Builder "Map Layers" widget (by Esri R&D Center Beijing), which Esri publishes under the Apache License, Version 2.0. It has been modified and extended by the City of Grand Junction, CO.

Licensed under Apache-2.0. See [LICENSE](LICENSE) for the full terms and [NOTICE](NOTICE) for attribution. Original work copyright Esri; modifications copyright City of Grand Junction, CO. This software is free to use, modify, and redistribute under those terms.
