import { VUE_CLONE_CSS } from './vue-clone-css.js'

export const PRINT_TOOL_CSS = VUE_CLONE_CSS + `
.qrcode-wrapper niqer-barcode,
.barcode-wrapper niqer-barcode {
  max-width: 100%;
  max-height: 100%;
}

.npt-preview {
  position: absolute;
  inset: 0;
  z-index: 2000;
  background-color: var(--el-overlay-color-lighter, rgba(0, 0, 0, 0.5));
  overflow: hidden;
}
.npt-preview[hidden] { display: none !important; }
.npt-preview .el-overlay-dialog {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.inline-report-dialog {
  --el-dialog-padding-primary: 0;
  width: 80vw;
  height: 99vh;
  margin: 0.5vh auto !important;
  padding: 0 !important;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.inline-report-dialog .el-dialog__header { display: none; }
.inline-report-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  border-radius: 4px;
  background-color: #f0f0f0;
}
.inline-report-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 10px;
  border-bottom: 1px solid #dee2e6;
  background: #f8f9fa;
  flex-shrink: 0;
}
.inline-report-toolbar__left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.inline-report-toolbar__title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inline-report-toolbar__actions { display: flex; gap: 8px; flex-shrink: 0; }
.inline-report-loading {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 14px;
  background: #f0f0f0;
}
.inline-report-viewer,
.report-pdf-host {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.npt-toast {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%) translateY(12px);
  background: #111;
  color: #fff;
  padding: 8px 14px;
  border-radius: 6px;
  opacity: 0;
  pointer-events: none;
  z-index: 2200;
  transition: .16s ease;
}
.npt-toast.on { opacity: 1; transform: translateX(-50%) translateY(0); }
.npt-toast[data-kind=err] { background: #b42318; }
.npt-toast[data-kind=ok] { background: #067647; }
.npt-mask {
  position: absolute;
  inset: 0;
  background: rgba(15,23,42,.28);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ps-mask { z-index: 2100; }
.npt-dlg {
  width: min(560px, 92%);
  max-height: 86%;
  overflow: auto;
  background: #fff;
  border-radius: 8px;
  padding: 14px 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,.18);
}
.npt-dlg.wide { width: min(860px, 96%); }
.npt-dlg.l_dialog_sm { width: 440px; max-width: 92%; }
.ps-dlg { width: min(540px, 92%); }
.npt-dlg h4 { margin: 0 0 10px; }
.npt-dlg-act { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.npt-dlg-act button {
  height: 36px;
  min-width: 80px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  background: #f3f4f6;
  color: #111827;
  cursor: pointer;
}
.npt-dlg-act button.pri { background: #2563eb; color: #fff; }
.npt-dlg-act button:disabled { opacity: 0.5; cursor: not-allowed; }
.print-count-panel { padding: 12px; display: grid; gap: 12px; }
.print-count-hint { margin: 0; font-size: 12px; line-height: 1.5; color: #6b7280; }
.print-count-row { display: flex; align-items: center; gap: 10px; }
.print-count-label { width: 72px; flex-shrink: 0; color: #374151; font-size: 13px; }
.print-count-select, .print-count-textarea { flex: 1; min-width: 0; }
.print-count-row--where { align-items: flex-start; }
.print-count-textarea { min-height: 88px; }
.npt-html-host { flex: 1; min-height: 0; background: #f0f0f0; }
.npt-html-frame { width: 100%; height: 100%; min-height: 0; border: 0; background: #fff; }
.report-html-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f0f0f0;
  outline: none;
}
.report-html-zoombar { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; flex-shrink: 0; }
.report-html-zoombar__btn { min-width: 32px; height: 28px; padding: 0 8px; border: 1px solid #ced4da; border-radius: 4px; background: #fff; color: #333; cursor: pointer; font-size: 14px; line-height: 1; }
.report-html-zoombar__btn:hover:not(:disabled) { background: #e9ecef; }
.report-html-zoombar__btn:disabled { opacity: 0.45; cursor: not-allowed; }
.report-html-zoombar__label { min-width: 48px; text-align: center; font-size: 13px; color: #333; font-variant-numeric: tabular-nums; }
.report-html-pages {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: auto;
  background: #f0f0f0;
  padding: 12px 0;
  box-sizing: border-box;
}
.report-html-pages--empty { display: flex; align-items: center; justify-content: center; }
.report-html-pages-inner { width: max-content; margin: 0 auto; }
.report-html-mount { display: block; }
.report-html-mount .report-html-root {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 0;
  margin: 0;
  background: transparent;
  width: max-content;
}
.report-html-mount .report-page {
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  flex-shrink: 0;
}
.tk-edit-box { position: fixed; z-index: 10050; width: 480px; max-width: 92vw; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25); padding: 14px; box-sizing: border-box; pointer-events: auto; }
.tk-edit-box__title { font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 10px; }
.tk-edit-box__ta { width: 100%; min-height: 140px; box-sizing: border-box; padding: 8px; font-size: 13px; resize: vertical; border: 1px solid #d1d5db; border-radius: 6px; user-select: text; }
.tk-edit-box__ta:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
.tk-edit-box__hint { margin-top: 8px; font-size: 12px; color: #6b7280; }
.tk-edit-box__btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.image-editor { resize: both; }
.text-editor { min-height: 25px; padding: 1px; box-sizing: border-box; border: none; outline: none; resize: none; font-size: 12px; background-color: #fff; overflow: hidden; width: 100%; height: auto; word-break: break-word; }
.print-designer { position: relative; }
.print-designer .paper-container { padding: 10px; }
.draggable-element.selected {
  outline: 1pt dashed #007bff;
  outline-offset: -1px;
  z-index: 9999;
}
.selection-box { position: absolute; border: 1px dashed #007bff; background-color: rgba(0, 123, 255, 0.1); }
.print-designer > .main-content .left-panel > .tabs,
.print-designer > .main-content .right-panel > .tabs {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.print-designer > .main-content .left-panel > .tabs > .tab-button,
.print-designer > .main-content .right-panel > .tabs > .tab-button {
  padding: 12px 8px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  background: none;
  box-shadow: none;
  border-bottom: 2px solid transparent;
}
.print-designer > .main-content .left-panel > .tabs > .tab-button.active,
.print-designer > .main-content .right-panel > .tabs > .tab-button.active {
  color: #2563eb;
  box-shadow: none;
  border-bottom: 2px solid #2563eb;
}
.print-designer > .main-content .left-panel > .tabs > .tab-button:hover:not(:disabled),
.print-designer > .main-content .right-panel > .tabs > .tab-button:hover:not(:disabled) {
  color: #1d4ed8;
  background: #f8fafc;
}
.tk-ui button.tb-action {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #e5e7eb !important;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  cursor: pointer;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  box-shadow: none;
}
.tk-ui button.tb-action:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1 !important;
  color: #111827;
}
.tk-ui button.tb-action--primary {
  background: #2563eb;
  border-color: #2563eb !important;
  color: #fff;
}
.tk-ui button.tb-action--primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: #1d4ed8 !important;
  color: #fff;
}
.tk-ui button.tb-btn {
  height: 32px;
  min-width: 32px;
  padding: 0 8px;
  border: none !important;
  border-right: 1px solid #e5e7eb !important;
  border-radius: 0;
  background: transparent;
  color: #4b5563;
  box-shadow: none;
}
.tk-ui .tb-group .tb-btn:last-child {
  border-right: none !important;
}
.tk-ui button.tb-btn:hover:not(:disabled) {
  background: #f3f4f6;
  color: #111827;
}
.tk-ui button.tb-btn.active {
  background: #eff6ff;
  color: #2563eb;
}
.tk-ui button.tb-btn--text {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  padding: 0 10px;
}
.npt-form { display: grid; gap: 6px; }
.npt-form label { color: #666; }
.npt-form input, .npt-form select, .npt-form textarea,
.ps-form input, .ps-form select {
  width: 100%;
  border: 1px solid var(--tk-line, #ccc);
  border-radius: 6px;
  padding: 6px 8px;
  box-sizing: border-box;
}
.npt-form textarea { min-height: 88px; font-family: Consolas, "Courier New", monospace; }
.print-designer > .main-content .left-panel > .tab-content,
.print-designer > .main-content .right-panel > .tab-content {
  padding: 0;
  min-height: 0;
}
.tab-content > [data-pane] { flex: 1; height: 100%; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.tab-content > [data-pane][hidden] { display: none !important; }
[data-pane=param] > .data-panel,
[data-pane=dataset] > .data-panel {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
}
[data-pane=dataset] .data-panel .ds-body,
[data-pane=dataset] .data-panel .fields,
[data-pane=dataset] .data-panel .field-list {
  min-width: 0;
  max-width: 100%;
}
[data-pane=dataset] .data-panel .field-list .field-row {
  display: flex;
  grid-template-columns: none;
  width: auto;
  max-width: 100%;
  box-sizing: border-box;
}
[data-pane=dataset] .data-panel .field-list .field-row .kv-cell {
  flex: 1;
  min-width: 0;
}
[data-pane=dataset] .data-panel .field-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  border: none;
  border-radius: 0;
  overflow: visible;
  background: transparent;
}
[data-pane=dataset] .data-panel .field-actions .action-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  flex: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #495057;
  transition: all 0.2s;
}
[data-pane=dataset] .data-panel .field-actions .action-btn:last-child {
  border-right: 1px solid #ddd;
}
[data-pane=dataset] .data-panel .field-actions .action-btn:hover:not(:disabled) {
  background-color: #f8f9fa;
  border-color: #007bff;
  color: #007bff;
}
[data-pane=dataset] .data-panel .field-actions .action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
[data-pane=dataset] .data-panel .field-actions .action-btn.plus-btn:hover:not(:disabled) {
  background-color: #e7f5ff;
  border-color: #28a745;
  color: #28a745;
}
[data-pane=dataset] .data-panel .field-actions .action-btn.delete-btn:hover:not(:disabled) {
  background-color: #fff5f5;
  border-color: #dc3545;
  color: #dc3545;
}
[data-pane=dataset] .data-panel .ds-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.el-overlay.npt-mask {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(15, 23, 42, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
}
.el-overlay.npt-mask [hidden] {
  display: none !important;
}
.dataset-panel-dataset-dialog {
  width: min(1200px, 92vw);
  max-width: 92vw;
}
.dataset-panel-dataset-dialog.is-api .meta-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.dataset-panel-dataset-dialog .api-request-line {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 12px 20px;
}
.dataset-panel-dataset-dialog .api-request-line .form-row {
  margin-bottom: 0;
}
.dataset-panel-dataset-dialog .header-mode {
  display: flex;
  gap: 10px;
}
.dataset-panel-dataset-dialog .header-mode .link-btn.is-on {
  font-weight: 700;
  color: #111827;
}
.dataset-panel-dataset-dialog .header-kv-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 32px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.dataset-panel-dataset-dialog .header-kv-row .action-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  flex: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #495057;
}
.dataset-panel-dataset-dialog .header-kv-row .action-btn:hover {
  background: #fff5f5;
  border-color: #dc3545;
  color: #dc3545;
}
.dataset-panel-dataset-dialog .el-dialog,
.l_dialog_sm .el-dialog {
  width: 100%;
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}
.l_dialog_sm {
  width: min(440px, 92vw);
}
.dataset-panel-dataset-dialog .label-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  letter-spacing: 0.3px;
}
.dataset-panel-dataset-dialog [data-sql-host] {
  width: 100%;
  min-height: 300px;
  height: 48vh;
}
.dataset-panel-dataset-dialog [data-sql-host] .cm-editor {
  height: 100%;
  width: 100%;
}
.el-button {
  height: 36px;
  min-width: 80px;
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #f3f4f6;
  color: #111827;
}
.el-button--primary {
  background: #2563eb;
  color: #fff;
}
.action-button {
  height: 36px;
  min-width: 80px;
  padding: 0 18px;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #f3f4f6;
  color: #111827;
}
.action-button--primary {
  background: #2563eb;
  color: #fff;
}
.action-button:disabled,
.el-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.param-import-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}
.properties-panel,
.properties-panel * { user-select: none; }
.npt-switch {
  position: relative;
  width: 40px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: #dcdfe6;
  cursor: pointer;
  flex: none;
  vertical-align: middle;
}
.npt-switch[data-on="1"] { background: #409eff; }
.npt-switch__core {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: left .2s;
  pointer-events: none;
}
.npt-switch[data-on="1"] .npt-switch__core { left: 22px; }
.templates-panel { display: flex; flex-direction: column; user-select: none; gap: 15px; flex: 1; height: 100%; min-height: 0; padding: 15px; overflow-y: auto; box-sizing: border-box; }
.template-actions { display: flex; justify-content: flex-start; gap: 8px; flex-shrink: 0; }
.templates-panel .action-btn { width: 32px; height: 32px; padding: 0; flex: none; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #495057; transition: all 0.2s; }
.templates-panel .action-btn:hover:not(:disabled) { background-color: #f8f9fa; border-color: #007bff; color: #007bff; }
.templates-panel .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.templates-panel .action-btn.plus-btn:hover:not(:disabled) { background-color: #e7f5ff; border-color: #28a745; color: #28a745; }
.templates-panel .action-btn.delete-btn:hover:not(:disabled) { background-color: #fff5f5; border-color: #dc3545; color: #dc3545; }
.templates-panel .action-btn.save-btn:hover:not(:disabled) { background-color: #e7f3ff; border-color: #007bff; color: #007bff; }
.export-btn__spinner { width: 14px; height: 14px; border: 2px solid #e0e0e0; border-top-color: #007bff; border-radius: 50%; animation: export-btn-spin 0.75s linear infinite; }
@keyframes export-btn-spin { to { transform: rotate(360deg); } }
.template-list { display: flex; flex-direction: column; gap: 8px; flex: 1; overflow-y: auto; }
.template-item { display: flex; align-items: center; gap: 8px; padding: 10px; background: white; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
.template-item:hover { background-color: #f8f9fa; border-color: #007bff; }
.template-item.active { background-color: #e7f3ff; border-color: #007bff; font-weight: 500; }
.template-item.selected { background-color: #fff3cd; border-color: #ffc107; }
.template-item.selected.active { background-color: #d1ecf1; border-color: #17a2b8; }
.template-name { flex: 1; font-size: 13px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.templates-panel .pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 10px; border-top: 1px solid #dee2e6; margin-top: auto; flex-shrink: 0; }
.templates-panel .pagination button { padding: 6px 12px; flex: none; border: 1px solid #ced4da; border-radius: 4px; background: white; cursor: pointer; font-size: 13px; }
.templates-panel .pagination button:hover:not(:disabled) { background-color: #f8f9fa; border-color: #007bff; }
.templates-panel .pagination button:disabled { opacity: 0.5; cursor: not-allowed; }
.templates-panel .pagination span { font-size: 13px; color: #6c757d; }
.no-template { text-align: center; padding: 40px 20px; color: #6c757d; font-size: 13px; flex: 1; display: flex; align-items: center; justify-content: center; }
.ps-section {
  margin: 4px 0 12px;
  padding-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #ebeef5;
}
.ps-section:not(:first-child) { margin-top: 18px; }
.ps-form {
  display: grid;
  grid-template-columns: 108px 1fr;
  gap: 8px 12px;
  align-items: center;
}
.ps-form label { color: #606266; font-size: 13px; }
.ps-agent-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.ps-check { display: flex; align-items: center; gap: 8px; }
.ps-check input { width: auto; }
.print-settings-hint {
  margin: 8px 0 0 108px;
  font-size: 12px;
  line-height: 1.5;
  color: #909399;
  white-space: pre-line;
}
.template-paper {
  color: #606266;
  font-variant-numeric: tabular-nums;
}
.agent-ok { color: #67c23a; }
.agent-off { color: #909399; }
.preview-overlay {
  background-color: #f0f0f0;
  overflow: hidden;
  position: absolute;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}
.preview-overlay--page {
  position: fixed;
}
.preview-overlay .npt-html-host,
.preview-overlay .preview-body.npt-html-host {
  flex: 1;
  min-height: 0;
}
.preview-overlay .npt-html-frame {
  min-height: 0;
  height: 100%;
}
.preview-header {
  background-color: #f8f9fa;
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--tk-divider, #eceef2);
  flex-shrink: 0;
}
.preview-header h2 {
  margin: 0;
  font-size: 18px;
  color: #333;
}
.preview-actions { display: flex; gap: 10px; }
.preview-pdf-viewer,
.npt-preview-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.report-pdf-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f0f0f0;
  outline: none;
  user-select: none;
}
.report-pdf-zoombar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0;
}
.report-pdf-zoombar__btn {
  min-width: 32px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.report-pdf-zoombar__btn:hover:not(:disabled) { background: #e9ecef; }
.report-pdf-zoombar__btn:disabled { opacity: 0.45; cursor: not-allowed; }
.report-pdf-zoombar__label {
  min-width: 48px;
  text-align: center;
  font-size: 13px;
  color: #333;
  font-variant-numeric: tabular-nums;
}
.report-pdf-pages {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: auto;
  background: #f0f0f0;
  padding: 12px 0;
  box-sizing: border-box;
}
.report-pdf-pages--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.report-pdf-pages-scaler {
  width: 100%;
  position: relative;
}
.report-pdf-pages-inner {
  width: 100%;
  will-change: transform;
}
.report-pdf-page {
  position: relative;
  margin: 0 auto 12px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
}
.report-pdf-page__canvas {
  display: block;
  pointer-events: none;
}
:host {
  display: block;
  position: relative;
  height: 100%;
  min-height: 0;
  font-family: inherit;
  color: inherit;
}
`
