#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/test-reports/coverage"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required. Run ./scripts/install.sh first."
    exit 1
  fi
}

require_pytest() {
  if ! python3 -m pytest --version >/dev/null 2>&1; then
    echo "python3 -m pytest is unavailable. Run ./scripts/install.sh first."
    exit 1
  fi
}

extract_go_total() {
  local module_dir="$1"
  local coverprofile="$2"
  (
    cd "$module_dir"
    go tool cover -func="$coverprofile" | awk '/^total:/ {print $3}' | tr -d '%'
  )
}

write_go_cover_report() {
  local module_dir="$1"
  local coverprofile="$2"
  local output_file="$3"
  (
    cd "$module_dir"
    go tool cover -func="$coverprofile" > "$output_file"
  )
}

rm -rf "$REPORT_DIR"
mkdir -p "$REPORT_DIR"

require_cmd go
require_cmd python3
require_pytest
require_cmd npm

echo "==> Running control plane coverage"
(
  cd "$ROOT_DIR/control-plane"
  go test -tags sqlite_fts5 -coverprofile="$REPORT_DIR/control-plane.coverprofile" ./...
)
write_go_cover_report "$ROOT_DIR/control-plane" "$REPORT_DIR/control-plane.coverprofile" "$REPORT_DIR/control-plane.cover.txt"

echo "==> Running Go SDK coverage"
(
  cd "$ROOT_DIR/sdk/go"
  go test -coverprofile="$REPORT_DIR/sdk-go.coverprofile" ./...
)
write_go_cover_report "$ROOT_DIR/sdk/go" "$REPORT_DIR/sdk-go.coverprofile" "$REPORT_DIR/sdk-go.cover.txt"

echo "==> Running Python SDK coverage"
(
  cd "$ROOT_DIR/sdk/python"
  python3 -m pytest \
    --cov-report=json:"$REPORT_DIR/sdk-python-coverage.json" \
    --cov-report=xml:"$REPORT_DIR/sdk-python-coverage.xml"
)

echo "==> Running TypeScript SDK coverage"
(
  cd "$ROOT_DIR/sdk/typescript"
  CI=1 npm run test:coverage:core
)
cp "$ROOT_DIR/sdk/typescript/coverage/coverage-summary.json" "$REPORT_DIR/sdk-typescript-coverage-summary.json"

echo "==> Running control plane web UI coverage"
(
  cd "$ROOT_DIR/control-plane/web/client"
  CI=1 npm run test:coverage
)
cp "$ROOT_DIR/control-plane/web/client/coverage/coverage-summary.json" "$REPORT_DIR/web-ui-coverage-summary.json"

CONTROL_PLANE_TOTAL="$(extract_go_total "$ROOT_DIR/control-plane" "$REPORT_DIR/control-plane.coverprofile")"
SDK_GO_TOTAL="$(extract_go_total "$ROOT_DIR/sdk/go" "$REPORT_DIR/sdk-go.coverprofile")"

export REPORT_DIR
export CONTROL_PLANE_TOTAL
export SDK_GO_TOTAL
python3 - <<'PY'
import json
import os
from pathlib import Path

report_dir = Path(os.environ["REPORT_DIR"])

with (report_dir / "sdk-python-coverage.json").open() as fh:
    python_data = json.load(fh)

with (report_dir / "sdk-typescript-coverage-summary.json").open() as fh:
    ts_data = json.load(fh)

with (report_dir / "web-ui-coverage-summary.json").open() as fh:
    ui_data = json.load(fh)

surfaces = [
    {
        "name": "control-plane",
        "kind": "go",
        "coverage_percent": float(os.environ["CONTROL_PLANE_TOTAL"]),
        "notes": "go test -tags sqlite_fts5 -coverprofile ./...",
    },
    {
        "name": "sdk-go",
        "kind": "go",
        "coverage_percent": float(os.environ["SDK_GO_TOTAL"]),
        "notes": "go test -coverprofile ./...",
    },
    {
        "name": "sdk-python",
        "kind": "python",
        "coverage_percent": float(python_data["totals"]["percent_covered"]),
        "notes": "pytest coverage over configured tracked modules",
    },
    {
        "name": "sdk-typescript",
        "kind": "typescript",
        "coverage_percent": float(ts_data["total"]["statements"]["pct"]),
        "notes": "vitest v8 coverage over src/**/*.ts via the core suite",
    },
    {
        "name": "web-ui",
        "kind": "typescript",
        "coverage_percent": float(ui_data["total"]["statements"]["pct"]),
        "notes": "vitest v8 coverage over client/src/**/*.{ts,tsx}",
    },
]

summary = {
    "generated_at": __import__("datetime").datetime.now(__import__("datetime").UTC).isoformat().replace("+00:00", "Z"),
    "surfaces": surfaces,
    "badge": {
        "schemaVersion": 1,
        "label": "coverage",
        "message": "tracked",
        "color": "4c1",
    },
    "notes": [
        "Functional tests run in a separate Docker-based workflow and are not part of these percentages.",
        "Percentages are reported per surface rather than collapsed into a misleading single monorepo number.",
    ],
}

(report_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
(report_dir / "badge.json").write_text(json.dumps(summary["badge"], indent=2) + "\n")

lines = [
    "# Coverage Summary",
    "",
    "| Surface | Coverage | Notes |",
    "| --- | ---: | --- |",
]

for surface in surfaces:
    lines.append(
        f"| {surface['name']} | {surface['coverage_percent']:.2f}% | {surface['notes']} |"
    )

lines.extend(
    [
        "",
        "Coverage badge endpoint data is written to `test-reports/coverage/badge.json`.",
        "Functional validation remains separate in `.github/workflows/functional-tests.yml`.",
    ]
)

(report_dir / "summary.md").write_text("\n".join(lines) + "\n")
PY

echo "Coverage artifacts written to $REPORT_DIR"
