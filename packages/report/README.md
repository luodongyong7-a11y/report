# @niqer/report

报表库，四个 Web Component，不依赖 Vue，可嵌进任意语言的页面：

- `<niqer-print-tool>` 完整设计器（模板/数据集/预览打印）
- `<niqer-report-preview>` 独立预览+打印页（HTML 或 PDF，走现有 `/report/*`）
- `<niqer-designer>` 只画布
- `<niqer-report>` 按模板+数据在浏览器里分页预览或出 PDF

依赖公开仓库 `@niqer/pdf`、`@niqer/barcode`（`git+https://github.com/luodongyong7-a11y/niqer-*.git`），可在任意环境安装构建。小数运算自带一份 decimal.js。不依赖 Vue。

```html
<script type="module" src="./src/index.js"></script>
<niqer-print-tool api-base="/report" template-api="/report/mode"></niqer-print-tool>
```

宿主接现有 `/report/*`（不要另造字段）：

```js
const tool = document.querySelector('niqer-print-tool')
tool.getAuthHeaders = () => ({ Authorization: 'Bearer ' + token })
tool.fetcher = async ({ method, url, body, headers, responseType }) => {
  // 等价 axios：GET/PUT/POST/PATCH/DELETE /report/mode、/report/sql/parse、
  // /report/dataset/api-fetch、/report/dataset/excel-parse、
  // /report/pdf/preview、/report/pdf、/report/zpl、/report/xlsx
}
```

```js
const d = document.querySelector('niqer-designer')
d.addEventListener('change', (e) => {
  document.querySelector('niqer-report').template = e.detail.template
})
```

```js
const el = document.querySelector('niqer-report')
el.template = {
  printKind: 'document', // 或 label
  paperSize: { width: 794, height: 1123 },
  headerY: 80,
  summaryA: 900,
  summaryB: 980,
  footerY: 1040,
  elements: [
    { id: 't', type: 'text', x: 20, y: 100, width: 200, height: 24, content: '${ds1.name}' }
  ]
}
el.data = { ds1: { type: 'EXCEL', data: [{ name: 'A' }] } }
el.addEventListener('load', () => {
  console.log(el.pageCount, el.text())
  const pdf = el.toPdf()
})
```

Vue 3：`isCustomElement: (t) => t.startsWith('niqer-')`，模板和数据用属性赋值（不要用 HTML `dataset`，那是 DOM 自带的）。

## `<niqer-print-tool>`

完整设计打印工具：模板列表、画布、参数、SQL/API/Excel 数据集、预览/PDF/ZPL/Excel、打印代理。

| 属性 | 含义 |
|---|---|
| `api-base` | 默认 `/report` |
| `template-api` | 默认 `/report/mode` |
| `src` | 可选，打开时载入的模板 JSON |
| `locale` | `zh-CN` / `en-US` / `vi-VN` |
| `preview-html-path` | 前端跳转预览页路径，默认 `/designer/preview-embedded` |
| `preview-pdf-path` | PDF 跳转预览页路径，默认 `/designer/preview` |

JS：`.fetcher`、`.getAuthHeaders`、`.isAdmin`、`.hostPrintCount`、`.template`、`.data`、`save()`、`preview()`、`loadTemplate(id)`、`undo()` / `redo()`。

事件 `change`、`save`、`template-change`、`ready`、`error`。

调用的后端路径与现有产品相同，不另造字段。本地示例：`examples/print-tool.html`（需登录后的 `/report` 服务）。

跳转预览页只要挂 `<niqer-report-preview>`，同一 origin 用 `previewKey` 读 session；别的语言项目把该页路径写到上面两个属性即可。

## `<niqer-report-preview>`

独立预览打印页。设计器「前端跳转 / PDF 跳转」打开的就是这个组件；也可以单独嵌进业务页。

| 属性 | 含义 |
|---|---|
| `api-base` | 默认 `/report` |
| `template-api` | 默认 `/report/mode` |
| `kind` | `html` 或 `pdf`；不写则路径含 `preview-embedded` 时用 html |
| `preview-key` | 不写则读地址栏 `previewKey` |
| `locale` | `zh-CN` / `en-US` / `vi-VN` |
| `hide-header` | 隐藏顶栏 |

```html
<script type="module" src="./src/print-tool/preview-element.js"></script>
<niqer-report-preview api-base="/report" kind="pdf"></niqer-report-preview>
<script type="module">
  const el = document.querySelector('niqer-report-preview')
  el.getAuthHeaders = () => ({ Authorization: 'Bearer ' + token })
  // 不走跳转时直接赋参（字段与 /report/pdf/preview 相同，不另造）：
  // el.apiParams = { templateId: 'T1' }
  el.addEventListener('ready', () => {})
  el.print()
</script>
```

JS：`.fetcher`、`.getAuthHeaders`、`.apiParams`、`print()`、`downloadPdf()`、`downloadXlsx()`。

事件 `ready`、`error`、`close`。

本地示例：`examples/preview.html`。

## `<niqer-designer>`

画布设计器：拖文本/图/条码/二维码/矩形，改纸张与分带，改属性，撤销重做，导入导出 JSON。

| 属性 | 含义 |
|---|---|
| `src` | 模板 JSON 地址 |

JS：`.template`、`.data`、`undo()`、`redo()`。

事件 `change`（`detail.template`）、`select`、`ready`、`error`。

快捷键：Delete、方向键、Ctrl+C/V、Ctrl+Z/Y。双击文本可直接改内容。右侧字段点一下会插入 `${ds1.xxx}`。

本地示例：`examples/designer.html`。

## `<niqer-report>`

| 属性 | 含义 |
|---|---|
| `src` | 模板 JSON 地址 |
| `data-src` | 数据集 JSON 地址 |
| `page` | 从 1 起；不写或 `0` 显示全部 |
| `scale` | 预览倍率 |

JS：`.template`、`.data`、`.laid`、`.pageCount`、`text()`、`toPdf()`。

事件 `load` / `error`，会冒泡。

元素类型：`text` / `data` / `rect` / `image` / `barcode` / `qrcode`。

`printKind: 'document'` 按数据区流式分页；`'label'` 数据集一行一页。

占位符：`${ds1.field}`、`${sum(...)}`、`${subtotal(...)}`、`${page}`、`${total}`。

## JS API

```js
import { layoutReport, reportToHtml, reportToPdf } from '@niqer/report'

const laid = layoutReport(template, { dataset })
reportToHtml(template)
reportToPdf(template) // Uint8Array
```

本地示例：`examples/component.html`、`examples/designer.html`（用静态服务打开）。

## License

MIT
