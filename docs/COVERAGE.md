# Coverage Guide

This repository now has two distinct local quality entry points:

- `./scripts/test-all.sh` for a broad local regression pass
- `./scripts/coverage-summary.sh` for per-surface coverage artifacts and badge inputs

## What `test-all.sh` covers

`./scripts/test-all.sh` runs:

- control-plane Go tests
- Go SDK tests
- Python SDK tests via `python3 -m pytest`
- TypeScript SDK core tests
- control-plane web UI tests

The TypeScript SDK core suite excludes MCP tests and `tests/harness_functional.test.ts`, which is a live provider test file that requires external agent CLIs and real API calls.

Web UI lint is intentionally opt-in for `test-all.sh` via `AGENTFIELD_RUN_UI_LINT=1` because the repo still carries existing lint debt that would otherwise make the broad regression entrypoint unreliable.

It is intended to answer a single question quickly: "did the core local test surfaces still pass after my change?"

## What `coverage-summary.sh` covers

`./scripts/coverage-summary.sh` writes artifacts to `test-reports/coverage/` for:

- control-plane Go coverage
- Go SDK coverage
- Python SDK coverage across the tracked modules configured in `sdk/python/pyproject.toml`
- TypeScript SDK coverage across `sdk/typescript/src/**/*.ts`, excluding the MCP slice while MCP removal is in progress
- control-plane web UI coverage across `control-plane/web/client/src/**/*.{ts,tsx}`

The script produces:

- `summary.md` for humans
- `summary.json` for automation
- `badge.json` for a Shields-compatible gist endpoint
- raw coverage outputs (`.coverprofile`, `.xml`, `.json`)

## Why the summary is per-surface

AgentField is a monorepo with separate runtimes, toolchains, and test semantics. A single blended percentage is easy to market and hard to defend.

The coverage workflow therefore reports one number per surface and treats the monorepo as a set of independently measurable areas.

Functional tests remain separate from these percentages. They are validated in `.github/workflows/functional-tests.yml` and provide trust in cross-service behavior that statement coverage alone cannot capture.

## GitHub Actions

`.github/workflows/coverage.yml` runs the coverage summary on pull requests and pushes to `main`, uploads the generated artifacts, and publishes the Markdown table into the Actions step summary.

On pushes to `main`, the workflow can also update a Shields-compatible gist if these secrets are configured:

- `GIST_TOKEN`
- `COVERAGE_GIST_ID`

Once configured, a README badge can point at the raw `badge.json` endpoint from that gist.

## Recommended public positioning

Until the lowest-tested surfaces materially improve, prefer:

- "coverage tracked"
- "coverage reports published"
- "cross-language CI + functional tests"

Avoid a single numeric monorepo coverage badge unless you are willing to defend how that number is calculated and why it is representative.
