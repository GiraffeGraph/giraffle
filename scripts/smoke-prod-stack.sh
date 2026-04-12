#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/.env.production"}
BASE_COMPOSE_FILE=${BASE_COMPOSE_FILE:-"$ROOT_DIR/docker-compose.prod.yml"}
BUILD_COMPOSE_FILE=${BUILD_COMPOSE_FILE:-"$ROOT_DIR/docker-compose.build.prod.yml"}
SECRETS_COMPOSE_FILE=${SECRETS_COMPOSE_FILE:-"$ROOT_DIR/docker-compose.prod.secrets.yml"}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-giraffle-smoke}
SMOKE_TIMEOUT_SECONDS=${SMOKE_TIMEOUT_SECONDS:-120}
SMOKE_INTERVAL_SECONDS=${SMOKE_INTERVAL_SECONDS:-2}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it from .env.production.example first."
  exit 1
fi

APP_PORT=${APP_PORT:-$(grep -E '^[[:space:]]*APP_PORT=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)}
APP_PORT=${APP_PORT:-3000}
HEALTHCHECK_URL=${HEALTHCHECK_URL:-"http://127.0.0.1:${APP_PORT}/api/health"}

compose_args="--env-file $ENV_FILE -f $BASE_COMPOSE_FILE -f $BUILD_COMPOSE_FILE"

if [ -f "$SECRETS_COMPOSE_FILE" ] && grep -Eq '^[[:space:]]*AUTH_SECRET_FILE=.+' "$ENV_FILE"; then
  compose_args="$compose_args -f $SECRETS_COMPOSE_FILE"
fi

compose() {
  # shellcheck disable=SC2086
  docker compose -p "$COMPOSE_PROJECT_NAME" $compose_args "$@"
}

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

compose up -d --build --remove-orphans

elapsed=0
while [ "$elapsed" -lt "$SMOKE_TIMEOUT_SECONDS" ]; do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1; then
    echo "Smoke test passed: $HEALTHCHECK_URL"
    exit 0
  fi

  sleep "$SMOKE_INTERVAL_SECONDS"
  elapsed=$((elapsed + SMOKE_INTERVAL_SECONDS))
done

echo "Smoke test failed: $HEALTHCHECK_URL did not become healthy in ${SMOKE_TIMEOUT_SECONDS}s"
compose logs
exit 1
