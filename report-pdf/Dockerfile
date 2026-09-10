# report-pdf 边车：Node 22 Alpine + 原装 Windows 字体，生成确定性 PDF。
# 构建上下文必须是仓库根目录（需要 packages/report-core）。
#   docker build -f report-pdf/Dockerfile -t report-pdf:tag .
# 构建前须先把 Windows 字体复制到 report-pdf/fonts/（deploy.ps1 自动执行）。
FROM node:22-alpine

RUN apk add --no-cache \
    cairo pango libjpeg-turbo giflib librsvg pixman \
    fontconfig \
    tzdata \
    && fc-cache -fv

ENV TZ=Asia/Ho_Chi_Minh

WORKDIR /app

COPY report-pdf/fonts/ /usr/share/fonts/win/
RUN fc-cache -fv

COPY packages/report-core/ ./packages/report-core/
COPY .docker-libs/niqer-barcode/ ./libs/niqer-barcode/
COPY .docker-libs/niqer-pdf/ ./libs/niqer-pdf/
COPY report-pdf/package.json report-pdf/package-lock.json ./report-pdf/
RUN cd packages/report-core && npm install --omit=dev \
    && cd /app/report-pdf \
    && npm pkg set dependencies.@niqer/report-core="file:../packages/report-core" \
    && npm pkg set dependencies.@niqer/barcode="file:../libs/niqer-barcode" \
    && npm pkg set dependencies.@niqer/pdf="file:../libs/niqer-pdf" \
    && npm install --omit=dev

COPY report-pdf/engine/ ./report-pdf/engine/

ENV NODE_ENV=production \
    PORT=7321 \
    HOST=0.0.0.0 \
    REPORT_WORKER_HEAP_MB=2048 \
    REPORT_MAX_DATA_ROWS=200000 \
    REPORT_FONT_TIMES=/usr/share/fonts/win/times.ttf \
    REPORT_FONT_TIMES_BOLD=/usr/share/fonts/win/timesbd.ttf \
    REPORT_FONT_TIMES_ITALIC=/usr/share/fonts/win/timesi.ttf \
    REPORT_FONT_TIMES_BOLDITALIC=/usr/share/fonts/win/timesbi.ttf \
    REPORT_FONT_SIMSUN=/usr/share/fonts/win/simsun.ttc \
    REPORT_FONT_SIMHEI=/usr/share/fonts/win/simhei.ttf \
    REPORT_FONT_SYMBOL=/usr/share/fonts/win/seguisym.ttf

EXPOSE 7321

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:7321/health || exit 1

USER node

WORKDIR /app/report-pdf
CMD ["node", "engine/server.mjs"]
