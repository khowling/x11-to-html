#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/session-manager/.env"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing $ENV_FILE. Copy session-manager/.env.example and configure it first." >&2
    exit 1
fi

if ! grep -Eq '^GUACAMOLE_JSON_SECRET=[0-9a-fA-F]{32}$' "$ENV_FILE"; then
    SECRET="$(openssl rand -hex 16)"
    if grep -q '^GUACAMOLE_JSON_SECRET=' "$ENV_FILE"; then
        sed -i "s/^GUACAMOLE_JSON_SECRET=.*/GUACAMOLE_JSON_SECRET=$SECRET/" "$ENV_FILE"
    else
        printf '\nGUACAMOLE_JSON_SECRET=%s\n' "$SECRET" >> "$ENV_FILE"
    fi
    chmod 600 "$ENV_FILE"
    echo "Generated GUACAMOLE_JSON_SECRET in session-manager/.env"
fi

NETWORK_NAME="$(sed -n 's/^X11_DOCKER_NETWORK=//p' "$ENV_FILE" | tail -1)"
NETWORK_NAME="${NETWORK_NAME:-x11-guacamole}"
GUACAMOLE_PORT="$(sed -n 's/^GUACAMOLE_PORT=//p' "$ENV_FILE" | tail -1)"
GUACAMOLE_PORT="${GUACAMOLE_PORT:-8080}"

if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    docker network create --internal "$NETWORK_NAME" >/dev/null
    echo "Created private Docker network $NETWORK_NAME"
elif [[ "$(docker network inspect "$NETWORK_NAME" --format '{{.Internal}}')" != "true" ]]; then
    echo "Docker network $NETWORK_NAME exists but is not internal. Remove or rename it before continuing." >&2
    exit 1
fi

docker compose \
    --env-file "$ENV_FILE" \
    -f "$ROOT_DIR/docker-compose.guacamole.yml" \
    up -d

echo "Guacamole is available at http://localhost:$GUACAMOLE_PORT"
