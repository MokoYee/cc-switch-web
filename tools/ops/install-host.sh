#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Usage:
  bash tools/ops/install-host.sh

What it does:
  1. If running from source checkout: install dependencies and build cli/daemon/web/shared
  2. If running from extracted release bundle: install production dependencies only
  3. Install or refresh the systemd --user service
  4. Record the deployed git ref in the local release state file when git metadata exists

State file:
  ${XDG_STATE_HOME:-$HOME/.local/state}/ai-cli-switch/release-state.env
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  ccsw_ops_fatal "install-host.sh does not accept extra arguments. Use --help for usage."
fi

ccsw_ops_ensure_repo_root
ccsw_ops_run_build_pipeline
ccsw_ops_install_or_refresh_service

if ccsw_ops_has_git_repo; then
  ccsw_ops_load_release_state
  ccsw_ops_save_release_state \
    "${CURRENT_COMMIT:-}" \
    "${CURRENT_REF:-}" \
    "$(ccsw_ops_current_commit)" \
    "$(ccsw_ops_current_ref)"
  ccsw_ops_info "Recorded deployed git state at ${CCSW_OPS_STATE_FILE}"
else
  ccsw_ops_warn "Git repository metadata is unavailable; release state was not recorded."
fi

ccsw_ops_info "Host install completed."
