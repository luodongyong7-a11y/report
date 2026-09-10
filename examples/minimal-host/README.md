# minimal-host（报表接入样板）

最小接入清单（不包含完整可运行工程，按宿主技术栈粘贴）：

## 后端

1. 依赖 `com.niqer.report:report-spring-boot-starter:1.0.0`
2. 配置 `report.pdf.sidecar-url`、DataSource、对象存储（或提供 `ReportObjectStorage`）
3. 收费版在宿主 `application.yml` 写 `report.license.key`（或 `report.license.file`），不要做界面激活
4. 提供 `ReportAuthGuard`（开发环境可 `enforce-admin: false`）
5. 执行 `report_template_binding` DDL（见 starter `db/`）

## 前端

外壳只引用报表工具。PDF / 条码由 `@niqer/report` 内部使用。

```js
import '@niqer/report'

const tool = document.createElement('niqer-print-tool')
tool.apiBase = '/report'
tool.templateApi = '/report/mode'
document.body.appendChild(tool)
```

独立工具若要模板存储和 JDBC 连接管理，由外壳注入 `storagePlugin` / `datasourcePlugin`（见 `apps/report-tool-web/src/plugins.js`）。

依赖：`file:D:/niqer-report`。

## 边车

```bash
docker compose -f ../../docker-compose.report.yml up -d
```

健康检查：`GET http://127.0.0.1:7321/health`
