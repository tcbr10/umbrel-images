#!/usr/bin/env bash
set -e

# Bridge Umbrel's persistent volume into the app's expected local paths.
export DB_PATH="${DB_PATH:-/data/db/kol.db}"

echo "[blitzai] starting backend (FastAPI) on ${HOST}:${BACKEND_PORT}..."
cd /app/backend
python -m uvicorn app.main:app \
    --host "${HOST}" \
    --port "${BACKEND_PORT}" \
    &
BACKEND_PID=$!

echo "[blitzai] starting frontend (Next.js) on ${HOST}:${FRONTEND_PORT}..."
cd /app/frontend
PORT="${FRONTEND_PORT}" HOSTNAME="${HOST}" npx next start \
    &
FRONTEND_PID=$!

term_handler() {
  echo "[blitzai] shutting down..."
  kill -TERM "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap term_handler SIGTERM SIGINT

wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE=$?
echo "[blitzai] one process exited (code $EXIT_CODE), stopping the other..."
term_handler
