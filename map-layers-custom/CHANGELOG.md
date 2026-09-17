# Changelog

Newest first. Every release bumps `manifest.json` and `package.json` together.

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
