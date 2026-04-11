#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/.env.production"}
COMPOSE_FILE=${COMPOSE_FILE:-"$ROOT_DIR/docker-compose.prod.yml"}
SECRETS_COMPOSE_FILE=${SECRETS_COMPOSE_FILE:-"$ROOT_DIR/docker-compose.prod.secrets.yml"}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

if [ -f "$SECRETS_COMPOSE_FILE" ] && grep -Eq '^[[:space:]]*AUTH_SECRET_FILE=.+' "$ENV_FILE"; then
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$SECRETS_COMPOSE_FILE" logs -f "$@"
else
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs -f "$@"
fi
