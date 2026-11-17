#!/bin/sh
set -e
# Apply pending migrations on start-up when requested (uses DIRECT_URL / DATABASE_URL).
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] applying database migrations…"
  npx prisma migrate deploy
fi
exec "$@"
