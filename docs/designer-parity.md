# 设计器能力对照（Vue = 规格）

状态：`齐` 已按规格迁入 `<niqer-print-tool>`；`多` 为本库保留且规格工具栏没有的能力。契约见 README：`api-base`、`template-api`、`src`、`locale`、`.fetcher`、`.getAuthHeaders`、`.isAdmin`、`.hostPrintCount`、`.template`、`.data`、`save/preview/loadTemplate/undo/redo`，事件 `ready/error/save/template-change/change`。

| 能力 | 规格 | 本库实现 | 状态 |
| --- | --- | --- | --- |
| 标签名不双注册 | `packages/report-vue/src/print-tool/element.js` 不再自动 `define('niqer-print-tool')`，改名为 `niqer-vue-print-tool` | `src/print-tool/element.js` `niqer-print-tool` | 齐 |
| locale 属性 | `PrintDesignerView` + `locales/*` | `element.js` observed `locale`；`i18n.js` `t()` 原样拷键 | 齐 |
| 左栏 Tab 模板/组件/属性 | `PrintDesignerView.vue` 左栏 | `shell.js` `setLeft`，模板 pane 用 `hidden` 保分页 | 齐 |
| 右栏 Tab 参数/数据集/打印次数 | `PrintDesignerView.vue:118` | `shell.js` 第三 Tab 仅当 `hostPrintCount.fetchTables` | 齐 |
| 左右栏拖宽 200–480 | `PrintDesignerView` | `shell.js` resize | 齐 |
| 对话框取消/确认 | `zh-CN.js` `cancel`/`confirm` | `util.js` `promptDlg`/`confirmDlg` | 齐 |
| 模板分页不丢 | `TemplatesPanel.vue` v-show | `shell.js` `hidden` 不卸 DOM | 齐 |
| 模板 CRUD | `TemplatesPanel.vue` `/report/mode` | `templates.js` 同 URL/body | 齐 |
| 保存框 id+中英越 | `PrintDesignerView` 保存框 | `shell.js` `onSave` + `requireKeys` | 齐 |
| 纸张 A4/A5/B5/自定义 mm | `Toolbar.vue` | `toolbar.js` + `applyPaperPreset` | 齐 |
| 横竖向 | `Toolbar.vue` radio | `toolbar.js` 按钮切换，规则同 `onOrientationChange` | 齐 |
| 对齐/列宽/合并/居中/均匀 | `Toolbar.vue` | `designer.js` `data-act` + `merge.js` | 齐 |
| 边框/字体/B I U S | `Toolbar.vue` | `toolbar.js` | 齐 |
| 四预览按钮第一层 | `Toolbar.vue:155-166` | `toolbar.js` `frontend-print`/`pdf-print`/`frontend-jump`/`pdf-jump` | 齐 |
| 工具栏控件 | `19ff281` `Toolbar.vue` | 同纸张/对齐/边框/字体/四预览，无标签下拉、无小计、无 ZPL | 齐 |
| 拖入/框选/拖移/八向缩放 | `DesignArea.vue` | `designer.js` | 齐 |
| 分带线 + Ctrl 吸附 | `DesignArea.vue` 线拖动 | `designer.js` `paintGuides` / band + Ctrl 贴元件边 | 齐 |
| 滚轮缩放 0.1–5 | `DesignArea.vue:2563` | `designer.js` wheel | 齐 |
| 快捷键 Delete/Ctrl方向/Shift改尺寸/复制粘贴/撤销/Esc | `DesignArea.vue:3-11` | `designer.js` keydown | 齐 |
| 双击内联编辑 | `DesignArea.vue` | `designer.js` dblclick 含条码/二维码 | 齐 |
| 条码 canvas 预览 | `reportBarcodeCanvas` | `canvas-barcode.js` | 齐 |
| 属性逐字段 | `PropertiesPanel.vue` | `designer.js` `paintProps` | 齐 |
| 参数增删改 | `ParamPanel.vue` | `param.js` | 齐 |
| SQL CodeMirror | `SqlEditor.vue` | `sql-editor.js` | 齐 |
| SQL parse/schema | `DatasetPanel.vue` | `dataset.js` 同路径 | 齐 |
| API api-fetch + trim + #{param} | `DatasetPanel.vue` | `dataset.js` | 齐 |
| 字段增删改选 | `DatasetPanel.vue` | `dataset.js` | 齐 |
| 四条预览链路 | `PrintDesignerView` 四函数 | `preview.js` + `preview-jump.js`；跳转页挂 `<niqer-report-preview>` | 齐 |
| 预览工具栏 | `InlineHtml/Pdf` + `useReportPreviewExport` | `preview.js` 关/打印/PDF/xlsx/设置 | 齐 |
| 打印次数写入 `printCount` | `PrintDesignerView.vue:1502` | `print-count.js` | 齐 |
| i18n zh/en/vi | `packages/report-vue/src/locales` | `print-tool/locales` 原样拷键 | 齐 |
| isAdmin | plugin `isAdmin` | `element.js` `.isAdmin` | 齐 |
| tool-web 入口 | Vue 入口 | 设计器/预览打印只挂 WC；登录设置仍是宿主 Vue | 齐 |

待确认（文档没有、不擅自补）：无。
