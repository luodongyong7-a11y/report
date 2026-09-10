# report (standalone)

Standalone report tool hosted on GitHub.

## Repos

| Repo | Role |
|------|------|
| https://github.com/luodongyong7-a11y/report | this repo: WC + tool-web/api + starter + sidecar |
| https://github.com/luodongyong7-a11y/pdf | @niqer/pdf |
| https://github.com/luodongyong7-a11y/barcode | @niqer/barcode |

## Dev

```bash
pnpm install
cd packages/report && npm install && npm run build && cd ../..
mvn -f report-starter/pom.xml -DskipTests install
mvn -f apps/report-tool-api/pom.xml -DskipTests package
# start sidecar on :7321, then:
java -jar apps/report-tool-api/target/report-tool-api-1.0.0.jar
cd apps/report-tool-web && npm run dev
```

Open http://localhost:5174/  (admin / admin123)

See docker-compose.tool.test.yml for containerized tool stack.

## Cloud VPS

Full stack (web+api+pdf): see [docs/deploy-cloud.md](docs/deploy-cloud.md). Build images with scripts/build-cloud-images.ps1, then docker-compose.cloud.yml on a public VPS.

