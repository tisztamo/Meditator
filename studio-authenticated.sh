#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${STUDIO_ENV_FILE:-$ROOT/.env.studio}"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<EOF
studio-authenticated.sh: missing env file: $ENV_FILE

Create it from .env.studio.example, or point STUDIO_ENV_FILE at another file.
EOF
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$ROOT"
exec bun studio.js
