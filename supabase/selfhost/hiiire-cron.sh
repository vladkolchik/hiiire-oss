#!/usr/bin/env bash
set -euo pipefail

source /opt/hiiire-cron/secret.env
CRON_SECRET="$(printf '%s' "$CRON_SECRET_B64" | base64 -d)"

run_endpoint() {
  local name="$1"
  local url="https://hiiire.com/api/cron/$name"
  local code="000"

  for attempt in 1 2 3; do
    code="$(
      curl \
        --silent \
        --show-error \
        --output /dev/null \
        --write-out '%{http_code}' \
        --max-time 300 \
        --request POST \
        --header "x-cron-secret: $CRON_SECRET" \
        "$url" || true
    )"

    if [[ "$code" == 2* ]]; then
      printf '%s endpoint=%s status=%s attempt=%s\n' \
        "$(date --iso-8601=seconds)" "$name" "$code" "$attempt"
      return 0
    fi

    sleep 10
  done

  printf '%s endpoint=%s status=%s result=failed\n' \
    "$(date --iso-8601=seconds)" "$name" "$code" >&2
  return 1
}

run_endpoint billing-renewals
run_endpoint plan-expiry
