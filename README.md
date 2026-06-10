# Map Layers Custom widget

A customized ArcGIS Experience Builder Map Layers widget for the City of Grand Junction, CO. It extends Esri's stock Map Layers widget with auto-include of new sub-layers, layer focus (isolate), add data, master opacity, a basemap switcher, a legend panel, saved views, and enhanced search and batch tools.

The downloadable widget lives in the `map-layers-custom` subfolder. Download a release, drop that folder into your Experience Builder install, and run the standard client `npm install`. See the widget's own README for the feature list and install steps.

## Repository layout

```
map-layers-custom-widget/        <- this repo
├── README.md                    <- this file (GitHub landing page)
├── LICENSE                      <- Apache-2.0
├── .gitignore                   <- ignores node_modules, .vs, dist, OS cruft
├── publish.ps1                  <- one-command publish/update automation
└── map-layers-custom/           <- the widget (drops into your-extensions/widgets)
    ├── package.json
    ├── package-lock.json        <- generated in the EB environment
    ├── manifest.json
    ├── README.md                <- install steps and feature list
    ├── LICENSE
    └── src/ ...
```

## Install (for users)

See [map-layers-custom/README.md](map-layers-custom/README.md). In short: download the release zip, place the `map-layers-custom` folder so its `manifest.json` sits directly inside `client/your-extensions/widgets/map-layers-custom/`, then run `npm install` in the `client` folder and restart.

## Requirements

- ArcGIS Experience Builder Developer Edition 1.19 or 1.20 (React 19). EB 1.18 and earlier are not supported.

## Publishing updates (for the maintainer)

The widget is developed in the Experience Builder install, then synced into this repo and pushed with `publish.ps1`. Edit the three variables at the top of the script the first time on a new machine, then:

```
# Code update only
powershell -ExecutionPolicy Bypass -File .\publish.ps1

# Code update plus a new downloadable release
powershell -ExecutionPolicy Bypass -File .\publish.ps1 -Release v1.1.0
```

The script mirrors the widget from the EB folder into the `map-layers-custom` subfolder (skipping `node_modules` and `.vs`), commits, pushes, and optionally cuts a versioned GitHub release with a downloadable zip. Tags must increase and never repeat.

## Esri Community

Post: https://community.esri.com/t5/experience-builder-custom-widgets/map-layers-custom/ba-p/1707477

## Credits and license

This widget is a derivative work based on Esri's ArcGIS Experience Builder "Map Layers" widget (by Esri R&D Center Beijing), which Esri publishes under the Apache License, Version 2.0. It has been modified and extended by the City of Grand Junction, CO.

Licensed under Apache-2.0. See [LICENSE](LICENSE) for the full terms and [NOTICE](NOTICE) for attribution. Original work copyright Esri; modifications copyright City of Grand Junction, CO. This software is free to use, modify, and redistribute under those terms.
