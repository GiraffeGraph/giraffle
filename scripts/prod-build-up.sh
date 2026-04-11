#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/.env.production"}
BASE_COMPOSE_FILE=${BASE_COMPOSE_FILE:-"$ROOT_DIR/docker-compose.prod.yml"}
BUILD_COMPOSE_FILE=${BUILD_COMPOSE_FILE:-"$ROOT_DIR/docker-compose.build.prod.yml"}
SECRETS_COMPOSE_FILE=${SECRETS_COMPOSE_FILE:-"$ROOT_DIR/docker-compose.prod.secrets.yml"}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it from .env.production.example first."
  exit 1
fi

set -- --env-file "$ENV_FILE" -f "$BASE_COMPOSE_FILE" -f "$BUILD_COMPOSE_FILE"

if [ -f "$SECRETS_COMPOSE_FILE" ] && grep -Eq '^[[:space:]]*AUTH_SECRET_FILE=.+' "$ENV_FILE"; then
  set -- "$@" -f "$SECRETS_COMPOSE_FILE"
fi

docker compose "$@" up -d --build --remove-orphans
