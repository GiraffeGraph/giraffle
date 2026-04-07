#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${ENV_FILE:-"$ROOT_DIR/.env.production"}
BASE_COMPOSE_FILE=${BASE_COMPOSE_FILE:-"$ROOT_DIR/docker-compose.prod.yml"}
BUILD_COMPOSE_FILE=${BUILD_COMPOSE_FILE:-"$ROOT_DIR/docker-compose.build.prod.yml"}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it from .env.production.example first."
  exit 1
fi

docker compose \
  --env-file "$ENV_FILE" \
  -f "$BASE_COMPOSE_FILE" \
  -f "$BUILD_COMPOSE_FILE" \
  up -d --build --remove-orphans
