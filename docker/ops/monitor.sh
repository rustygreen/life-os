#!/usr/bin/env bash

set -euo pipefail

INTERVAL_SECONDS="${OPS_MONITOR_INTERVAL_SECONDS:-300}"
MAX_BACKUP_AGE_SECONDS="${OPS_MONITOR_MAX_BACKUP_AGE_SECONDS:-172800}"
ALERT_WEBHOOK_URL="${OPS_ALERT_WEBHOOK_URL:-}"
ALERT_MIN_SECONDS_BETWEEN_NOTIFICATIONS="${OPS_ALERT_MIN_SECONDS_BETWEEN_NOTIFICATIONS:-1800}"
API_HEALTH_URL="${OPS_API_HEALTH_URL:-http://api:4000/health}"
WEB_HEALTH_URL="${OPS_WEB_HEALTH_URL:-http://web/}"
HERMES_HEALTH_URL="${OPS_HERMES_HEALTH_URL:-http://hermes:4010/health}"

LAST_ALERT_FILE="/tmp/life-os-last-alert-at"

emit() {
  printf "[ops-monitor] %s\n" "$1"
}

send_alert() {
  local message="$1"
  local now
  now="$(date +%s)"

  if [[ -f "${LAST_ALERT_FILE}" ]]; then
    local last
    last="$(cat "${LAST_ALERT_FILE}")"
    if (( now - last < ALERT_MIN_SECONDS_BETWEEN_NOTIFICATIONS )); then
      emit "Alert suppressed to avoid notification spam"
      return
    fi
  fi

  if [[ -n "${ALERT_WEBHOOK_URL}" ]]; then
    local payload
    payload="{\"text\":\"${message}\"}"
    curl -sS -X POST "${ALERT_WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "${payload}" \
      >/dev/null || emit "Failed to send webhook alert"
  fi

  printf "%s" "${now}" > "${LAST_ALERT_FILE}"
}

latest_backup_age_seconds() {
  local latest
  latest="$(ls -1t /backups/*.sql.gz 2>/dev/null | head -n 1 || true)"
  if [[ -z "${latest}" ]]; then
    printf "%s" "-1"
    return
  fi

  local backup_epoch now
  backup_epoch="$(stat -c %Y "${latest}")"
  now="$(date +%s)"
  printf "%s" "$(( now - backup_epoch ))"
}

check_once() {
  local failures=()

  if ! curl -fsS --max-time 5 "${API_HEALTH_URL}" >/dev/null; then
    failures+=("api_unhealthy")
  fi

  if ! curl -fsS --max-time 5 "${WEB_HEALTH_URL}" >/dev/null; then
    failures+=("web_unhealthy")
  fi

  if ! curl -fsS --max-time 5 "${HERMES_HEALTH_URL}" >/dev/null; then
    failures+=("hermes_unhealthy")
  fi

  local backup_age
  backup_age="$(latest_backup_age_seconds)"
  if [[ "${backup_age}" == "-1" ]]; then
    failures+=("backup_missing")
  elif (( backup_age > MAX_BACKUP_AGE_SECONDS )); then
    failures+=("backup_stale:${backup_age}s")
  fi

  if (( ${#failures[@]} > 0 )); then
    local detail
    detail="$(IFS=','; echo "${failures[*]}")"
    local message="Life OS monitor detected failures: ${detail}"
    emit "${message}"
    send_alert "${message}"
    return 1
  fi

  emit "Health check passed"
  return 0
}

while true; do
  check_once || true
  sleep "${INTERVAL_SECONDS}"
done
