#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
ENV_EXAMPLE_FILE="${ROOT_DIR}/.env.example"

info() {
  printf "[life-os] %s\n" "$1"
}

fail() {
  printf "[life-os] ERROR: %s\n" "$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command not found: $1"
  fi
}

ensure_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${ENV_EXAMPLE_FILE}" "${ENV_FILE}"
    info "Created .env from .env.example"
  fi
}

load_env() {
  set -a
  source "${ENV_FILE}"
  set +a
}

compose() {
  docker compose --project-directory "${ROOT_DIR}" "$@"
}

compose_with_tag() {
  local image_tag="$1"
  shift
  LIFE_OS_IMAGE_TAG="${image_tag}" docker compose --project-directory "${ROOT_DIR}" "$@"
}

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    sed -i.bak -E "s|^${key}=.*$|${key}=${value}|" "${ENV_FILE}"
    rm -f "${ENV_FILE}.bak"
  else
    printf "%s=%s\n" "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

ensure_requirements() {
  require_command docker
  compose version >/dev/null 2>&1 || fail "Docker Compose plugin is required"
  ensure_env_file
}

backup_once() {
  ensure_requirements
  load_env

  local backup_dir="${POSTGRES_BACKUP_DIR:-${ROOT_DIR}/backups/postgres}"
  local backup_prefix="life_os_manual"
  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local backup_file="${backup_dir}/${backup_prefix}_${timestamp}.sql.gz"

  mkdir -p "${backup_dir}"
  info "Creating backup at ${backup_file}"

  compose exec -T postgres \
    pg_dump \
      -U "${POSTGRES_USER:-life_os}" \
      -d "${POSTGRES_DB:-life_os}" \
      --no-owner \
      --no-privileges \
    | gzip > "${backup_file}"

  info "Backup created"
}

restore_from_file() {
  ensure_requirements
  load_env

  local source_file="${1:-}"
  [[ -n "${source_file}" ]] || fail "Usage: ./scripts/lifeos.sh restore <path-to-backup.sql.gz>"
  [[ -f "${source_file}" ]] || fail "Backup file not found: ${source_file}"

  info "Restoring ${source_file}"

  gunzip -c "${source_file}" | compose exec -T postgres \
    psql -U "${POSTGRES_USER:-life_os}" -d "${POSTGRES_DB:-life_os}"

  info "Restore completed"
}

install_stack() {
  ensure_requirements
  info "Pulling base images"
  compose pull postgres redis postgres-backup ops-monitor || true
  info "Building application images"
  compose build api worker web hermes
  info "Starting stack"
  compose up -d
  info "Stack is up"
}

update_stack() {
  ensure_requirements
  backup_once
  info "Updating images"
  compose pull
  info "Rebuilding application images"
  compose build api worker web hermes
  info "Applying rolling restart"
  compose up -d --remove-orphans
  info "Update complete"
}

wait_for_service_health() {
  local container_name="$1"
  local timeout_seconds="${2:-180}"
  local start
  start="$(date +%s)"

  while true; do
    local state
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_name}" 2>/dev/null || true)"
    if [[ "${state}" == "healthy" || "${state}" == "running" ]]; then
      return 0
    fi

    local now
    now="$(date +%s)"
    if (( now - start > timeout_seconds )); then
      return 1
    fi
    sleep 3
  done
}

health_check() {
  ensure_requirements
  require_command curl
  load_env

  local backup_dir="${POSTGRES_BACKUP_DIR:-${ROOT_DIR}/backups/postgres}"
  local max_age="${OPS_MONITOR_MAX_BACKUP_AGE_SECONDS:-172800}"
  local api_url="${OPS_API_HEALTH_URL:-http://localhost:4000/health}"
  local web_url="${OPS_WEB_HEALTH_URL:-http://localhost:3000/}"
  local hermes_url="${OPS_HERMES_HEALTH_URL:-http://localhost:4010/health}"

  [[ "${backup_dir}" = /* ]] || backup_dir="${ROOT_DIR}/${backup_dir}"

  local failed=0

  if ! curl -fsS --max-time 8 "${api_url}" >/dev/null; then
    info "Health check failed: API endpoint unreachable"
    failed=1
  fi

  if ! curl -fsS --max-time 8 "${web_url}" >/dev/null; then
    info "Health check failed: Web endpoint unreachable"
    failed=1
  fi

  if ! curl -fsS --max-time 8 "${hermes_url}" >/dev/null; then
    info "Health check failed: Hermes endpoint unreachable"
    failed=1
  fi

  local latest_backup
  latest_backup="$(find "${backup_dir}" -maxdepth 1 -type f -name '*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2- || true)"
  if [[ -z "${latest_backup}" ]]; then
    info "Health check failed: No PostgreSQL backup found in ${backup_dir}"
    failed=1
  else
    local now backup_age
    now="$(date +%s)"
    backup_age="$(( now - $(stat -c %Y "${latest_backup}") ))"
    if (( backup_age > max_age )); then
      info "Health check failed: Backup is stale (${backup_age}s old)"
      failed=1
    fi
  fi

  if (( failed == 0 )); then
    info "Health check passed"
    return 0
  fi

  local webhook="${OPS_ALERT_WEBHOOK_URL:-}"
  if [[ -n "${webhook}" ]]; then
    curl -sS -X POST "${webhook}" \
      -H "Content-Type: application/json" \
      -d '{"text":"Life OS health check failed"}' >/dev/null || true
  fi

  return 1
}

release_update() {
  ensure_requirements
  load_env

  local new_tag="${1:-}"
  [[ -n "${new_tag}" ]] || fail "Usage: ./scripts/lifeos.sh release-update <image-tag>"

  local previous_tag="${LIFE_OS_IMAGE_TAG:-local}"

  backup_once
  info "Pulling immutable release images for tag ${new_tag}"
  compose_with_tag "${new_tag}" pull api worker web hermes

  info "Deploying release tag ${new_tag}"
  compose_with_tag "${new_tag}" up -d --no-build api worker web hermes

  if ! wait_for_service_health "life-os-api" 180 || ! wait_for_service_health "life-os-web" 180 || ! wait_for_service_health "life-os-hermes" 180; then
    info "Release health check failed, rolling back to ${previous_tag}"
    compose_with_tag "${previous_tag}" up -d --no-build api worker web hermes
    fail "Release update failed and rollback was applied"
  fi

  set_env_value "LIFE_OS_IMAGE_TAG" "${new_tag}"
  info "Release update complete"
}

status_stack() {
  ensure_requirements
  compose ps
}

logs_stack() {
  ensure_requirements
  compose logs --tail=150 -f
}

stop_stack() {
  ensure_requirements
  compose down
}

usage() {
  cat <<'USAGE'
Life OS operations utility

Usage:
  ./scripts/lifeos.sh install      Prepare and start the full stack
  ./scripts/lifeos.sh update       Backup, pull, rebuild, and restart the stack
  ./scripts/lifeos.sh release-update TAG Deploy immutable tagged images with rollback on health failure
  ./scripts/lifeos.sh backup       Run an immediate PostgreSQL backup
  ./scripts/lifeos.sh health       Run one-shot health and backup freshness checks
  ./scripts/lifeos.sh restore FILE Restore PostgreSQL from a .sql.gz backup
  ./scripts/lifeos.sh status       Show running services
  ./scripts/lifeos.sh logs         Follow service logs
  ./scripts/lifeos.sh stop         Stop and remove running services
USAGE
}

main() {
  local command="${1:-}"
  case "${command}" in
    install)
      install_stack
      ;;
    update)
      update_stack
      ;;
    release-update)
      release_update "${2:-}"
      ;;
    backup)
      backup_once
      ;;
    health)
      health_check
      ;;
    restore)
      restore_from_file "${2:-}"
      ;;
    status)
      status_stack
      ;;
    logs)
      logs_stack
      ;;
    stop)
      stop_stack
      ;;
    *)
      usage
      ;;
  esac
}

main "$@"
