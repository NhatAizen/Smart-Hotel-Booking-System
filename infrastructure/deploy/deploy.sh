#!/usr/bin/env sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="infrastructure/deploy/.env.prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "Thiếu $ENV_FILE"
  exit 1
fi

"$(dirname "$0")/validate-prod-env.sh" "$ENV_FILE"

docker compose \
  -f docker-compose.yml \
  -f infrastructure/deploy/docker-compose.prod.yml \
  --env-file "$ENV_FILE" \
  up -d --build

docker compose \
  -f docker-compose.yml \
  -f infrastructure/deploy/docker-compose.prod.yml \
  --env-file "$ENV_FILE" \
  ps
