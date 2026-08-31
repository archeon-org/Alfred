#!/usr/bin/env sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

if [ ! -f .env ]; then
  cp .env.example .env
  printf '%s\n' 'Created .env from .env.example; replace the local database password before deployment.'
fi

corepack enable
pnpm install
UV_CACHE_DIR=.cache/uv uv sync --project apps/agent --all-groups

printf '%s\n' 'Alfred is ready. Run `pnpm dev` or `docker compose up --build`.'
