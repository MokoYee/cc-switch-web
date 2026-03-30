#!/usr/bin/env bash

set -euo pipefail

readonly CCSW_OPS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly CCSW_OPS_REPO_ROOT="$(cd "${CCSW_OPS_SCRIPT_DIR}/../.." && pwd)"
readonly CCSW_OPS_CLI_ENTRY="${CCSW_OPS_REPO_ROOT}/apps/cli/dist/index.js"
readonly CCSW_OPS_DAEMON_ENTRY="${CCSW_OPS_REPO_ROOT}/apps/daemon/dist/index.js"
readonly CCSW_OPS_WEB_INDEX="${CCSW_OPS_REPO_ROOT}/apps/web/dist/index.html"
readonly CCSW_OPS_RELEASE_MANIFEST="${CCSW_OPS_REPO_ROOT}/release/manifest.json"
readonly CCSW_OPS_SERVICE_NAME="ai-cli-switch.service"
readonly CCSW_OPS_SYSTEMD_UNIT_PATH="${HOME}/.config/systemd/user/${CCSW_OPS_SERVICE_NAME}"
readonly CCSW_OPS_STATE_DIR="${XDG_STATE_HOME:-${HOME}/.local/state}/ai-cli-switch"
readonly CCSW_OPS_STATE_FILE="${CCSW_OPS_STATE_DIR}/release-state.env"

ccsw_ops_info() {
  printf '[ccsw-ops] %s\n' "$*"
}

ccsw_ops_warn() {
  printf '[ccsw-ops] WARN: %s\n' "$*" >&2
}

ccsw_ops_fatal() {
  printf '[ccsw-ops] ERROR: %s\n' "$*" >&2
  exit 1
}

ccsw_ops_run() {
  ccsw_ops_info "+ $*"
  "$@"
}

ccsw_ops_ensure_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    ccsw_ops_fatal "Required command not found: ${command_name}"
  fi
}

ccsw_ops_is_release_bundle() {
  [[ -f "${CCSW_OPS_RELEASE_MANIFEST}" ]]
}

ccsw_ops_ensure_repo_root() {
  [[ -f "${CCSW_OPS_REPO_ROOT}/package.json" ]] || ccsw_ops_fatal "Repository root not found: ${CCSW_OPS_REPO_ROOT}"

  if ccsw_ops_is_release_bundle; then
    [[ -f "${CCSW_OPS_CLI_ENTRY}" ]] || ccsw_ops_fatal "CLI dist entry missing under ${CCSW_OPS_REPO_ROOT}"
    [[ -f "${CCSW_OPS_DAEMON_ENTRY}" ]] || ccsw_ops_fatal "Daemon dist entry missing under ${CCSW_OPS_REPO_ROOT}"
    [[ -f "${CCSW_OPS_WEB_INDEX}" ]] || ccsw_ops_fatal "Web dist entry missing under ${CCSW_OPS_REPO_ROOT}"
    return
  fi

  [[ -f "${CCSW_OPS_REPO_ROOT}/apps/cli/src/index.ts" ]] || ccsw_ops_fatal "CLI source entry missing under ${CCSW_OPS_REPO_ROOT}"
}

ccsw_ops_ensure_node_runtime() {
  ccsw_ops_ensure_command node
  ccsw_ops_ensure_command npm
}

ccsw_ops_has_git_repo() {
  git -C "${CCSW_OPS_REPO_ROOT}" rev-parse --git-dir >/dev/null 2>&1
}

ccsw_ops_ensure_git_repo() {
  ccsw_ops_ensure_command git
  ccsw_ops_has_git_repo || ccsw_ops_fatal "This operation requires a git checkout at ${CCSW_OPS_REPO_ROOT}"
}

ccsw_ops_ensure_clean_worktree() {
  local git_status
  git_status="$(git -C "${CCSW_OPS_REPO_ROOT}" status --porcelain)"
  if [[ -n "${git_status}" ]]; then
    ccsw_ops_fatal "Working tree is not clean. Commit or stash changes before switching refs."
  fi
}

ccsw_ops_current_commit() {
  git -C "${CCSW_OPS_REPO_ROOT}" rev-parse HEAD
}

ccsw_ops_current_ref() {
  if git -C "${CCSW_OPS_REPO_ROOT}" symbolic-ref --quiet --short HEAD >/dev/null 2>&1; then
    git -C "${CCSW_OPS_REPO_ROOT}" symbolic-ref --quiet --short HEAD
    return
  fi

  ccsw_ops_current_commit
}

ccsw_ops_resolve_ref() {
  local target_ref="$1"
  git -C "${CCSW_OPS_REPO_ROOT}" rev-parse --verify "${target_ref}^{commit}"
}

ccsw_ops_switch_to_ref() {
  local target_ref="$1"

  if git -C "${CCSW_OPS_REPO_ROOT}" show-ref --verify --quiet "refs/heads/${target_ref}"; then
    ccsw_ops_run git -C "${CCSW_OPS_REPO_ROOT}" switch "${target_ref}"
    return
  fi

  ccsw_ops_run git -C "${CCSW_OPS_REPO_ROOT}" switch --detach "${target_ref}"
}

ccsw_ops_systemd_user_available() {
  systemctl --user show-environment >/dev/null 2>&1
}

ccsw_ops_assert_systemd_user() {
  ccsw_ops_ensure_command systemctl

  if ! ccsw_ops_systemd_user_available; then
    ccsw_ops_fatal "systemd --user is unavailable on this host. Use foreground mode or a Linux host with systemd --user support."
  fi
}

ccsw_ops_stop_service_if_installed() {
  if [[ ! -f "${CCSW_OPS_SYSTEMD_UNIT_PATH}" ]]; then
    ccsw_ops_info "User service unit is not installed yet; skipping stop."
    return
  fi

  if systemctl --user is-active --quiet "${CCSW_OPS_SERVICE_NAME}"; then
    ccsw_ops_run systemctl --user stop "${CCSW_OPS_SERVICE_NAME}"
    return
  fi

  ccsw_ops_info "User service is already stopped."
}

ccsw_ops_run_build_pipeline() {
  ccsw_ops_ensure_node_runtime

  pushd "${CCSW_OPS_REPO_ROOT}" >/dev/null
  if ccsw_ops_is_release_bundle; then
    ccsw_ops_info "Detected extracted release bundle; installing production dependencies without rebuild."
    if [[ -f package-lock.json ]]; then
      ccsw_ops_run npm ci --omit=dev
    else
      ccsw_ops_run npm install --omit=dev
    fi
    popd >/dev/null
    return
  fi

  if [[ -f package-lock.json ]]; then
    ccsw_ops_run npm ci
  else
    ccsw_ops_run npm install
  fi

  ccsw_ops_run npm run build
  popd >/dev/null
}

ccsw_ops_install_or_refresh_service() {
  ccsw_ops_assert_systemd_user

  pushd "${CCSW_OPS_REPO_ROOT}" >/dev/null
  ccsw_ops_run node "${CCSW_OPS_CLI_ENTRY}" daemon service install
  ccsw_ops_run node "${CCSW_OPS_CLI_ENTRY}" daemon service status
  popd >/dev/null
}

ccsw_ops_load_release_state() {
  if [[ ! -f "${CCSW_OPS_STATE_FILE}" ]]; then
    return
  fi

  # shellcheck disable=SC1090
  source "${CCSW_OPS_STATE_FILE}"
}

ccsw_ops_save_release_state() {
  local previous_commit="$1"
  local previous_ref="$2"
  local current_commit="$3"
  local current_ref="$4"
  local updated_at

  updated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  mkdir -p "${CCSW_OPS_STATE_DIR}"

  {
    printf "PREVIOUS_COMMIT=%q\n" "${previous_commit}"
    printf "PREVIOUS_REF=%q\n" "${previous_ref}"
    printf "CURRENT_COMMIT=%q\n" "${current_commit}"
    printf "CURRENT_REF=%q\n" "${current_ref}"
    printf "UPDATED_AT=%q\n" "${updated_at}"
  } > "${CCSW_OPS_STATE_FILE}"
}
