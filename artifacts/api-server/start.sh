#!/usr/bin/env sh
# start.sh — Render production startup script
# 1. Applies all pending database migrations
# 2. Starts the API server
set -e

echo "=== Almacén Químico — Production Startup ==="

echo "Step 1/2: Applying database migrations..."
pnpm --filter @workspace/db migrate

echo "Step 2/2: Starting API server..."
node dist/index.cjs
