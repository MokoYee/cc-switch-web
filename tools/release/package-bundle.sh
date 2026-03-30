#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Usage:
  bash tools/release/package-bundle.sh

What it does:
  1. Build the current workspace artifacts
  2. Stage a deployable release bundle under dist/release/
  3. Create a .tar.gz archive and matching .sha256 checksum file
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  ccsw_release_fatal "package-bundle.sh does not accept extra arguments. Use --help for usage."
fi

ccsw_release_ensure_repo_root
ccsw_release_ensure_command node
ccsw_release_ensure_command npm
ccsw_release_ensure_command tar

pushd "${CCSW_RELEASE_REPO_ROOT}" >/dev/null
ccsw_release_run npm run build
popd >/dev/null

version="$(ccsw_release_version)"
commit="$(ccsw_release_current_commit)"
short_commit="$(ccsw_release_short_commit "${commit}")"
artifact_basename="$(ccsw_release_artifact_basename "${version}" "${short_commit}")"
created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
stage_root="${CCSW_RELEASE_OUT_DIR}/.stage-${artifact_basename}"
bundle_root="${stage_root}/${artifact_basename}"
artifact_path="${CCSW_RELEASE_OUT_DIR}/${artifact_basename}.tar.gz"
checksum_path="${artifact_path}.sha256"

mkdir -p "${CCSW_RELEASE_OUT_DIR}"
rm -rf "${stage_root}" "${artifact_path}" "${checksum_path}"
mkdir -p "${bundle_root}"

release_paths=(
  "LICENSE"
  "README.md"
  "package.json"
  "package-lock.json"
  "apps/cli/package.json"
  "apps/cli/dist"
  "apps/daemon/package.json"
  "apps/daemon/dist"
  "apps/web/package.json"
  "apps/web/dist"
  "packages/shared/package.json"
  "packages/shared/dist"
  "docs/README.md"
  "docs/linux-web-console-design.md"
  "docs/linux-operations-runbook.md"
  "docs/examples/prometheus"
  "tools/ops"
  "tools/release/verify-bundle.sh"
  "tools/release/verify-latest-bundle.sh"
)

for relative_path in "${release_paths[@]}"; do
  ccsw_release_stage_path "${relative_path}" "${bundle_root}"
done

ccsw_release_write_manifest "${bundle_root}" "$(basename "${artifact_path}")" "${version}" "${commit}" "${created_at}"

pushd "${stage_root}" >/dev/null
ccsw_release_run tar -czf "${artifact_path}" "${artifact_basename}"
popd >/dev/null

checksum="$(ccsw_release_checksum "${artifact_path}")"
printf '%s  %s\n' "${checksum}" "$(basename "${artifact_path}")" > "${checksum_path}"

rm -rf "${stage_root}"

ccsw_release_info "Release bundle created:"
ccsw_release_info "  ${artifact_path}"
ccsw_release_info "  ${checksum_path}"
