#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Usage:
  bash tools/ops/rollback-host.sh [--ref <git-ref>]

Examples:
  bash tools/ops/rollback-host.sh
  bash tools/ops/rollback-host.sh --ref a57645c
  bash tools/ops/rollback-host.sh --ref v0.1.0

Notes:
  - Without --ref, the script rolls back to PREVIOUS_COMMIT from the local release state file.
  - This script requires a git checkout. For extracted release bundles, redeploy the previous bundle and run install-host.sh again.
  - The working tree must be clean before switching refs.
  - The service is stopped before rebuild so the host never serves mixed UI and daemon artifacts.
EOF
}

target_ref=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      [[ $# -ge 2 ]] || ccsw_ops_fatal "--ref requires a git ref value."
      target_ref="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      ccsw_ops_fatal "Unknown argument: $1"
      ;;
  esac
done

ccsw_ops_ensure_repo_root
ccsw_ops_ensure_git_repo
ccsw_ops_ensure_clean_worktree

previous_commit="$(ccsw_ops_current_commit)"
previous_ref="$(ccsw_ops_current_ref)"

if [[ -z "${target_ref}" ]]; then
  ccsw_ops_load_release_state
  target_ref="${PREVIOUS_COMMIT:-}"
  [[ -n "${target_ref}" ]] || ccsw_ops_fatal "No PREVIOUS_COMMIT recorded in ${CCSW_OPS_STATE_FILE}. Pass --ref explicitly."
fi

ccsw_ops_resolve_ref "${target_ref}" >/dev/null
ccsw_ops_switch_to_ref "${target_ref}"

ccsw_ops_assert_systemd_user
ccsw_ops_stop_service_if_installed
ccsw_ops_run_build_pipeline
ccsw_ops_install_or_refresh_service

ccsw_ops_save_release_state \
  "${previous_commit}" \
  "${previous_ref}" \
  "$(ccsw_ops_current_commit)" \
  "$(ccsw_ops_current_ref)"

ccsw_ops_info "Host rollback completed."
