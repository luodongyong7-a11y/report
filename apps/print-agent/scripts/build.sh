#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist}"
mkdir -p "$OUT"
cd "$ROOT"
cargo build --release
BIN="tk-print-agent"
if [[ "$(uname -s)" == "Darwin" ]]; then
  PLATFORM="macos-$(uname -m | sed 's/x86_64/x64/;s/arm64/aarch64/')"
else
  PLATFORM="linux-x64"
fi
cp "target/release/$BIN" "$OUT/$BIN"
cat > "$OUT/README.txt" <<EOF
TK Print Agent
Run: ./$BIN [--bind lan] [--erp http://ERP:PORT]
Default: http://127.0.0.1:19290
EOF
ZIP="$OUT/tk-print-agent-$PLATFORM.zip"
rm -f "$ZIP"
(cd "$OUT" && zip -q "$(basename "$ZIP")" "$BIN" README.txt)
echo "Built: $ZIP"
