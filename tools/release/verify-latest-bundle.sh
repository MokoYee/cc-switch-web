#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Usage:
  bash tools/release/verify-latest-bundle.sh

What it does:
  1. Scan dist/release/ for the newest .tar.gz artifact
  2. Verify the artifact checksum, manifest, and manifest includedPaths
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  ccsw_release_fatal "verify-latest-bundle.sh does not accept extra arguments. Use --help for usage."
fi

ccsw_release_ensure_repo_root

shopt -s nullglob
artifacts=("${CCSW_RELEASE_OUT_DIR}"/*.tar.gz)
shopt -u nullglob

(( ${#artifacts[@]} > 0 )) || ccsw_release_fatal "No release artifact found under ${CCSW_RELEASE_OUT_DIR}"

latest_artifact="${artifacts[0]}"
for artifact_path in "${artifacts[@]}"; do
  if [[ "${artifact_path}" -nt "${latest_artifact}" ]]; then
    latest_artifact="${artifact_path}"
  fi
done

ccsw_release_info "Verifying latest artifact: ${latest_artifact}"
bash "${CCSW_RELEASE_REPO_ROOT}/tools/release/verify-bundle.sh" "${latest_artifact}"
