import { type IMThemeVariables, css, type SerializedStyles, polished } from 'jimu-core'

export function getStyle (theme: IMThemeVariables): SerializedStyles {
  return css`
    .widget-setting-layerlist{
      .source-descript {
        color: ${theme.ref.palette.neutral[1000]};
      }

      .webmap-thumbnail{
        cursor: auto;
        width: 100%;
        height: 120px;
        overflow: hidden;
        padding: 1px;
        border: ${polished.rem(2)} solid initial;
        img, div{
          width: 100%;
          height: 100%;
        }
      }

      .warning-tooltip{
        .jimu-icon-component {
          color: ${theme.sys.color.warning.main}
        }
      }

      .layerlist-tools{
        .layerlist-tools-item{
          display: flex;
          /* justify-content: space-between; */
          margin-bottom: 8px;
          align-items: center;
        }
      }

      .map-selector-section .component-map-selector .form-control{
        width: 100%;
      }

      .data-selector-section, .map-selector-section{
        padding-top: 10px;
      }

      .check-box-label {
        color: ${theme.ref.palette.neutral[1000]};
        font-weight: 400;
        line-height: ${polished.rem(18)};
      }

      .cursor-pointer {
        cursor: pointer;
      }

      .auto-include-section {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid ${theme.ref.palette.neutral[400]};
      }
      .auto-include-section .auto-include-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      .auto-include-section .auto-include-header {
        font-weight: 500;
        color: ${theme.ref.palette.neutral[1000]};
        margin-bottom: 0;
        display: block;
      }
      .auto-include-section .auto-include-refresh {
        font-size: ${polished.rem(12)};
        color: ${theme.sys.color.primary.main};
        cursor: pointer;
        text-decoration: underline;
      }
      .auto-include-section .auto-include-refresh:hover {
        opacity: 0.8;
      }
      .auto-include-section .auto-include-desc {
        font-size: ${polished.rem(12)};
        color: ${theme.ref.palette.neutral[900]};
        margin-bottom: 8px;
        line-height: 1.4;
      }
      .auto-include-section .auto-include-row {
        margin-bottom: 4px;
      }
      .auto-include-section .auto-include-empty {
        font-size: ${polished.rem(12)};
        color: ${theme.ref.palette.neutral[900]};
        font-style: italic;
        padding: 8px 0;
      }

      .enhanced-options-desc {
        font-size: ${polished.rem(12)};
        color: ${theme.ref.palette.neutral[900]};
        line-height: 1.4;
        margin-bottom: 4px;
        display: block;
      }

    }
  `
}
