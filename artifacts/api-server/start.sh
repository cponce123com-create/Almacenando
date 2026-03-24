#!/bin/sh
# ---------------------------------------------------------------------------
# Render production startup script
#
# Execution order:
#   1. Run database migrations (creates all tables if they don't exist)
#   2. Start the API server (which runs the idempotent seed on startup)
#
# This script is run from the REPO ROOT by Render, so all paths are
# relative to the repo root.
# ---------------------------------------------------------------------------

set -e

echo "=== [1/2] Running database migrations ==="
pnpm --filter @workspace/db migrate

echo "=== [2/2] Starting API server ==="
exec node artifacts/api-server/dist/index.cjs
