# 云主机部署完整独立版

本机无公网入口时，用一台有公网 IP 的云主机跑 Docker：web（nginx 反代）+ api + pdf sidecar。

## 机器要求

- 公网 IP（或绑定域名）
- 2 vCPU / 4 GB 内存起（PDF 边车较吃内存；预算紧可用 2 GB 并把 `REPORT_WORKER_HEAP_MB` 降到 1024）
- 磁盘 ≥ 20 GB
- 系统：Ubuntu 22.04/24.04 较省事
- 安全组/防火墙放行：`22`（SSH）、`80`（HTTP）；有域名后再加 `443`

## 一、在本机构建镜像（Windows 已有 Docker 时）

仓库根目录执行：

```powershell
pwsh -File scripts/build-cloud-images.ps1
```

会：

1. 从 GitHub 拉 `barcode` / `pdf` 到 `.docker-libs`
2. 复制 Windows 字体到 `report-pdf/fonts`
3. 构建 `@niqer/report` 与 `report-tool-web`（`VITE_BASE=/`）
4. `docker build` 三个镜像：`report-pdf` / `report-tool-api` / `report-tool-web`

## 二、传到云主机

```powershell
# 例：换成你的 IP 和用户
$Host = 'root@x.x.x.x'
docker save report-pdf:standalone report-tool-api:standalone report-tool-web:standalone -o report-images.tar
scp report-images.tar docker-compose.cloud.yml .env.cloud.example ${Host}:/opt/report-tool/
ssh $Host 'cd /opt/report-tool && docker load -i report-images.tar'
```

也可在云主机上直接 `git clone` 后本机构建（需装 Docker + Maven + Node，更慢）。

## 三、启动

```bash
cd /opt/report-tool
cp .env.cloud.example .env.cloud
# 务必改 REPORT_TOOL_ADMIN_PASSWORD
nano .env.cloud
docker compose -f docker-compose.cloud.yml --env-file .env.cloud up -d
docker compose -f docker-compose.cloud.yml ps
curl -sS http://127.0.0.1/health
```

浏览器打开：`http://公网IP/`  
登录：`.env.cloud` 里的账号密码。

## 四、域名与 HTTPS（可选）

用 Caddy 或 nginx + Let’s Encrypt 反代到本机 `80` 上的 `report-tool-web`。API 已由容器内 nginx 代理 `/auth`、`/report`，外层只反代整站即可。

## 注意

- GitHub Pages 静态站与云主机是两套入口；对外演示请用云主机地址。
- 默认 H2 文件库在 volume `report-tool-data`，备份该 volume 即可。
- `REPORT_API_INTERNAL_BASE_URL` 仅在需要服务端回调你们内网 ERP 时再填。
