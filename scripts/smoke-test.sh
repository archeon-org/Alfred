#!/usr/bin/env sh
set -eu

api_url=${API_HEALTH_URL:-http://localhost:3000/health/live}
web_url=${WEB_HEALTH_URL:-http://localhost:5173/healthz}
agent_url=${AGENT_HEALTH_URL:-http://localhost:2024/ok}

check_url() {
  name=$1
  url=$2
  if ! curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; then
    printf '%s\n' "Smoke check failed for $name at $url" >&2
    return 1
  fi
  printf '%s\n' "$name is healthy at $url"
}

check_url web "$web_url"
check_url api "$api_url"
check_url agent "$agent_url"
