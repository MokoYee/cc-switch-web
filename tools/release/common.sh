#!/usr/bin/env bash

set -euo pipefail

readonly CCSW_RELEASE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly CCSW_RELEASE_REPO_ROOT="$(cd "${CCSW_RELEASE_SCRIPT_DIR}/../.." && pwd)"
readonly CCSW_RELEASE_OUT_DIR="${CCSW_RELEASE_OUT_DIR:-${CCSW_RELEASE_REPO_ROOT}/dist/release}"

ccsw_release_info() {
  printf '[ccsw-release] %s\n' "$*"
}

ccsw_release_fatal() {
  printf '[ccsw-release] ERROR: %s\n' "$*" >&2
  exit 1
}

ccsw_release_run() {
  ccsw_release_info "+ $*"
  "$@"
}

ccsw_release_ensure_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    ccsw_release_fatal "Required command not found: ${command_name}"
  fi
}

ccsw_release_checksum() {
  local file_path="$1"

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file_path}" | awk '{print $1}'
    return
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file_path}" | awk '{print $1}'
    return
  fi

  ccsw_release_fatal "Required command not found: shasum or sha256sum"
}

ccsw_release_ensure_repo_root() {
  [[ -f "${CCSW_RELEASE_REPO_ROOT}/package.json" ]] || ccsw_release_fatal "Repository root not found: ${CCSW_RELEASE_REPO_ROOT}"
  [[ -f "${CCSW_RELEASE_REPO_ROOT}/apps/cli/src/index.ts" ]] || ccsw_release_fatal "CLI source entry missing under ${CCSW_RELEASE_REPO_ROOT}"
}

ccsw_release_version() {
  node -p "require('${CCSW_RELEASE_REPO_ROOT}/package.json').version"
}

ccsw_release_current_commit() {
  if git -C "${CCSW_RELEASE_REPO_ROOT}" rev-parse --git-dir >/dev/null 2>&1; then
    git -C "${CCSW_RELEASE_REPO_ROOT}" rev-parse HEAD
    return
  fi

  printf ''
}

ccsw_release_short_commit() {
  local commit="$1"
  if [[ -z "${commit}" ]]; then
    printf ''
    return
  fi

  printf '%.12s' "${commit}"
}

ccsw_release_artifact_basename() {
  local version="$1"
  local short_commit="$2"

  if [[ -n "${short_commit}" ]]; then
    printf 'cc-switch-web-%s-%s' "${version}" "${short_commit}"
    return
  fi

  printf 'cc-switch-web-%s' "${version}"
}

ccsw_release_stage_path() {
  local relative_path="$1"
  local bundle_root="$2"
  local source_path="${CCSW_RELEASE_REPO_ROOT}/${relative_path}"
  local destination_dir="${bundle_root}/$(dirname "${relative_path}")"

  [[ -e "${source_path}" ]] || ccsw_release_fatal "Missing required release path: ${relative_path}"
  mkdir -p "${destination_dir}"
  cp -R "${source_path}" "${destination_dir}/"
}

ccsw_release_write_manifest() {
  local bundle_root="$1"
  local artifact_name="$2"
  local version="$3"
  local commit="$4"
  local created_at="$5"
  local manifest_path="${bundle_root}/release/manifest.json"

  mkdir -p "$(dirname "${manifest_path}")"

  CCSW_RELEASE_ARTIFACT_NAME="${artifact_name}" \
  CCSW_RELEASE_VERSION="${version}" \
  CCSW_RELEASE_COMMIT="${commit}" \
  CCSW_RELEASE_CREATED_AT="${created_at}" \
  node <<'EOF' > "${manifest_path}"
const manifest = {
  schemaVersion: 1,
  productName: "CC Switch Web",
  packageName: "cc-switch-web",
  version: process.env.CCSW_RELEASE_VERSION,
  commit: process.env.CCSW_RELEASE_COMMIT || null,
  createdAt: process.env.CCSW_RELEASE_CREATED_AT,
  artifactName: process.env.CCSW_RELEASE_ARTIFACT_NAME,
  installMode: "bundle",
  runtime: {
    node: ">=20.0.0",
    installCommand: "npm ci --omit=dev",
    serviceInstallCommand: "bash tools/ops/install-host.sh"
  },
  includedPaths: [
    "apps/cli/dist",
    "apps/daemon/dist",
    "apps/web/dist",
    "packages/shared/dist",
    "tools/ops",
    "docs/examples/prometheus"
  ]
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
EOF
}
