import { type IMThemeVariables, css, type SerializedStyles } from 'jimu-core'
import type { IMConfig } from '../../config'

export function getStyle(theme: IMThemeVariables, widgetConfig: IMConfig): SerializedStyles {
  return css`
    overflow: auto;
    .widget-layerlist {
      width: 100%;
      height: 100%;
      min-height: 32px;
      overflow-x: hidden;

      // Drag handler popper text
      --calcite-dropdown-item-text-color: var(--sys-color-surface-overlay-text);
      --calcite-dropdown-group-title-text-color: var(--sys-color-surface-overlay-text);
      --calcite-dropdown-item-background-color-hover: rgba(0, 0, 0, 0.2);
      --calcite-dropdown-item-text-color-press: var(--sys-color-surface-overlay-text);

      // Action hover text color, it should stay the same
      --calcite-color-text-1: var(--sys-color-action-text);
      // Action hover bg opacity
      --calcite-color-transparent-hover: rgba(0, 0, 0, 0.2);

      --calcite-list-background-color-hover: rgba(0, 0, 0, 0.2);

      // Action elements color
      --calcite-color-text-3: var(--sys-color-action-text);
      // ListItem color
      --calcite-list-label-text-color: var(--sys-color-surface-paper-text);
      // Action button color
      --calcite-action-text-color: var(--sys-color-action-text);
      --calcite-font-family: ${theme.sys.typography.body.fontFamily};

      // Let the Paper component decide the color
      --calcite-list-background-color: transparent;

      calcite-flow {
        calcite-flow-item {
          background: transparent;
          // Hover background border radius
          --calcite-corner-radius-sharp: 0;
        }
      }

      calcite-action {
        // Disabled Legend button's background
        --calcite-color-foreground-1: transparent;
      }

      calcite-list-item {
        --calcite-color-foreground-3: rgba(0, 0, 0, 0.2);
      }

      // Visibility checkbox / Eyeball icon
      .esri-layer-list__visible-toggle {
        --calcite-action-text-color: ${widgetConfig?.useTickBoxes ? 'var(--sys-color-action-selected)' : '' };
        ${widgetConfig?.useTickBoxes ? '--calcite-color-text-1: var(--sys-color-action-selected);' : '' };
      }

      .esri-layer-list__item-message {
        // For empty warning message and icon
        --calcite-notice-content-text-color: var(--sys-color-surface-overlay-text);
        font-family: ${theme.sys.typography.body.fontFamily};
      }

      .esri-legend__layer-cell {
        font-family: ${theme.sys.typography.body.fontFamily};
        font-size: var(--calcite-font-size--2);
      }

      .esri-layer-list__item-action {
        outline-offset: -2px;
      }

      .table-list-divider {
        border-block-start: 1px solid var(--sys-color-divider-secondary);
        font-size: var(--calcite-font-size-0);
        font-weight: 500;
        padding: 20px 12px;
        height: 28px;
      }

      .map-layers-collapsible-region {
        transition: opacity 0.15s ease;
      }

      .map-layers-header {
        gap: 4px;
      }
    }
  `
}
