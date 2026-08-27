#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker build -t x11-web-base "$ROOT_DIR/x11-web-bridge"
docker build -t x11-app-xterm "$ROOT_DIR/x11-apps/xterm"
docker build -t x11-app-xeyes "$ROOT_DIR/x11-apps/xeyes"
