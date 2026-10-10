#!/bin/bash
# Installs workspace dependencies in Claude Code cloud sessions so `pnpm verify`
# (spec check, typecheck, unit + conformance tests) can run right away.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || npm install -g pnpm@10 >/dev/null
fi

# `pnpm install` (not --frozen-lockfile) reuses the cached store across sessions.
# Its prepare script also points git at .githooks so pre-push runs `pnpm verify`.
pnpm install --prefer-offline
