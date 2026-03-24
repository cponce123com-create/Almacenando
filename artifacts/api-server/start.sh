#!/usr/bin/env sh
# start.sh — Render production startup script
#
# IMPORTANT: Render runs this script from the ROOT of the repository,
# not from artifacts/api-server/. All paths are written relative to the
# repo root to avoid "file not found" errors.
#
# Execution order:
#   1. Apply all pending Drizzle migrations  (pnpm --filter @workspace/db migrate)
#   2. Start the compiled API server         (node artifacts/api-server/dist/index.cjs)
set -e

echo "=== Almacén Químico — Production Startup ==="

echo "Step 1/2: Applying database migrations..."
pnpm --filter @workspace/db migrate

echo "Step 2/2: Starting API server..."
node artifacts/api-server/dist/index.cjs
