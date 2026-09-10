# TK Print Agent (Rust)

Low-memory cross-platform silent print agent for tk-report / ERP.

## Features

- `GET /health` — probe (no token)
- `GET /printers` — list printers
- `POST /apply-profile` — one-click custom paper (Windows Form; Unix soft-apply)
- `POST /print` — multipart silent PDF print
- `GET|POST /config` — `bindMode` (`loopback`|`lan`), ERP URL
- Optional heartbeat to ERP `/api/print-agent/heartbeat`
- System tray (Windows/macOS): show address, open log dir, quit (`--no-tray` to disable)

## Build (Windows)

Single `tk-print-agent.exe`（构建时嵌入 Sumatra，运行时解压到本地缓存，无需随包第二个软件）。

```powershell
.\scripts\fetch-sumatra.ps1   # 仅构建机需要，用于 embed
.\scripts\build.ps1
# 用户机：解压 zip 后双击「安装.bat」（默认局域网共享）
# 开发机也可：
.\scripts\install.ps1
```

## Build (macOS / Linux)

```bash
chmod +x scripts/build.sh
./scripts/build.sh
./dist/tk-print-agent --bind loopback
```

## LAN share

```text
tk-print-agent.exe --bind lan
```

Other PCs point print settings to `http://<host-ip>:19290`.
