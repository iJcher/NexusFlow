#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/nexus}"
ARCHIVE_PATH="${ARCHIVE_PATH:-/tmp/nexus-deploy.tar.gz}"

mkdir -p "$DEPLOY_PATH"
cd "$DEPLOY_PATH"

tar -xzf "$ARCHIVE_PATH"
rm -f "$ARCHIVE_PATH"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "[deploy] .env created from .env.example. Please update secrets before public use."
fi

docker compose up -d --build
docker compose ps
