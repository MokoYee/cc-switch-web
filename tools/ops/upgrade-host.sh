#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Usage:
  bash tools/ops/upgrade-host.sh [--ref <git-ref>]

Examples:
  bash tools/ops/upgrade-host.sh
  bash tools/ops/upgrade-host.sh --ref v0.1.0
  bash tools/ops/upgrade-host.sh --ref main

Notes:
  - Without --ref, the script upgrades from the current checkout or extracted release bundle state.
  - With --ref, the script switches the repository to the target ref first.
  - The working tree must be clean before switching refs.
  - --ref requires a git checkout; extracted release bundles only support the current bundle state.
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

previous_commit=""
previous_ref=""

if ccsw_ops_has_git_repo; then
  previous_commit="$(ccsw_ops_current_commit)"
  previous_ref="$(ccsw_ops_current_ref)"

  if [[ -n "${target_ref}" ]]; then
    ccsw_ops_ensure_git_repo
    ccsw_ops_ensure_clean_worktree
    ccsw_ops_resolve_ref "${target_ref}" >/dev/null
    ccsw_ops_switch_to_ref "${target_ref}"
  fi
elif [[ -n "${target_ref}" ]]; then
  ccsw_ops_fatal "--ref requires a git checkout."
fi

ccsw_ops_assert_systemd_user
ccsw_ops_stop_service_if_installed
ccsw_ops_run_build_pipeline
ccsw_ops_install_or_refresh_service

if ccsw_ops_has_git_repo; then
  ccsw_ops_save_release_state \
    "${previous_commit}" \
    "${previous_ref}" \
    "$(ccsw_ops_current_commit)" \
    "$(ccsw_ops_current_ref)"
  ccsw_ops_info "Recorded deployed git state at ${CCSW_OPS_STATE_FILE}"
fi

ccsw_ops_info "Host upgrade completed."
