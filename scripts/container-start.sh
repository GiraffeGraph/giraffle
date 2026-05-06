#!/usr/bin/env sh
set -eu

if [ -n "${AUTH_SECRET_FILE:-}" ] && [ -f "$AUTH_SECRET_FILE" ]; then
  AUTH_SECRET=$(tr -d '\r\n' < "$AUTH_SECRET_FILE")
  export AUTH_SECRET
fi

if [ -n "${NEXTAUTH_SECRET_FILE:-}" ] && [ -f "$NEXTAUTH_SECRET_FILE" ]; then
  NEXTAUTH_SECRET=$(tr -d '\r\n' < "$NEXTAUTH_SECRET_FILE")
  export NEXTAUTH_SECRET
fi

mkdir -p "${UPLOAD_DIR:-/app/uploads}"

npx prisma migrate deploy
exec node server.js
