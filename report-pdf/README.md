# report-pdf 边车

独立 Node 渲染服务：接收「已填 dataset 的模板 JSON」，返回 PDF / XLSX。

## 构建

仓库根目录：

```bash
# 先准备 Windows 字体到 report-pdf/fonts/
docker build -f report-pdf/Dockerfile -t report-pdf:1.0.0 .
```

依赖 `@niqer/report-core`（构建时 COPY `packages/report-core`）。

## 运行

```bash
docker compose -f docker-compose.report.yml up -d
```

或：

```bash
cd report-pdf && npm run engine:serve
```

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `7321` | HTTP 端口 |
| `HOST` | `127.0.0.1`（容器内 Dockerfile 设 `0.0.0.0`） | 监听地址 |
| `REPORT_WORKERS` | `min(cpu-1,4)` | worker 数 |
| `REPORT_WORKER_HEAP_MB` | `2048` | 单 worker 堆上限 |
| `REPORT_MAX_DATA_ROWS` | `200000` | 数据行防爆 |
| `REPORT_FONT_TIMES` 等 | 见 Dockerfile | 字体路径 |
| `REPORT_CACHE_TTL_MS` | `0` | 结果缓存 TTL，0 关闭 |

## HTTP 契约

- `GET /health` — 健康检查
- `POST /render` — body=模板 JSON，返回 `application/pdf`
- `POST /render/xlsx` — 同上，返回 xlsx

宿主 Spring 配置：

```yaml
report:
  pdf:
    sidecar-url: http://report-pdf:7321/render
```
