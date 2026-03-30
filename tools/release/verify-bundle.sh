#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash tools/release/verify-bundle.sh <artifact.tar.gz> [artifact.tar.gz.sha256]

What it does:
  1. Verify the SHA256 checksum
  2. Confirm the archive contains release/manifest.json
  3. Print version and commit from the embedded manifest
EOF
}

ccsw_release_info() {
  printf '[ccsw-release] %s\n' "$*"
}

ccsw_release_fatal() {
  printf '[ccsw-release] ERROR: %s\n' "$*" >&2
  exit 1
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

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

artifact_path="${1:-}"
checksum_path="${2:-}"

[[ -n "${artifact_path}" ]] || ccsw_release_fatal "Artifact path is required. Use --help for usage."
[[ -f "${artifact_path}" ]] || ccsw_release_fatal "Artifact not found: ${artifact_path}"

if [[ -z "${checksum_path}" ]]; then
  checksum_path="${artifact_path}.sha256"
fi

[[ -f "${checksum_path}" ]] || ccsw_release_fatal "Checksum file not found: ${checksum_path}"

command -v tar >/dev/null 2>&1 || ccsw_release_fatal "Required command not found: tar"
command -v node >/dev/null 2>&1 || ccsw_release_fatal "Required command not found: node"
command -v mktemp >/dev/null 2>&1 || ccsw_release_fatal "Required command not found: mktemp"

expected_checksum="$(awk '{print $1}' "${checksum_path}")"
actual_checksum="$(ccsw_release_checksum "${artifact_path}")"

[[ "${expected_checksum}" == "${actual_checksum}" ]] || ccsw_release_fatal "Checksum mismatch for ${artifact_path}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
manifest_path="${tmp_dir}/manifest.json"
entries_path="${tmp_dir}/entries.txt"
tar -tf "${artifact_path}" > "${entries_path}"

manifest_entry="$(awk '/(^|\/)release\/manifest\.json$/ { print; exit }' "${entries_path}")"
[[ -n "${manifest_entry}" ]] || ccsw_release_fatal "Embedded release/manifest.json not found in ${artifact_path}"

bundle_root="${manifest_entry%/release/manifest.json}"

tar -xOf "${artifact_path}" "${manifest_entry}" > "${manifest_path}"

verify_summary="$(
  BUNDLE_ROOT="${bundle_root}" \
  MANIFEST_PATH="${manifest_path}" \
  ENTRIES_PATH="${entries_path}" \
  node <<'EOF'
const fs = require("fs");

const normalize = (value) => value.replace(/\/+$/, "");
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"));
const bundleRoot = normalize(process.env.BUNDLE_ROOT ?? "");
const entries = fs
  .readFileSync(process.env.ENTRIES_PATH, "utf8")
  .split(/\r?\n/)
  .map((item) => normalize(item.trim()))
  .filter(Boolean);

const missingPaths = (manifest.includedPaths ?? []).filter((relativePath) => {
  const targetPath = normalize(bundleRoot ? `${bundleRoot}/${relativePath}` : relativePath);
  return !entries.some((entry) => entry === targetPath || entry.startsWith(`${targetPath}/`));
});

if (missingPaths.length > 0) {
  console.error(`Missing manifest includedPaths in archive: ${missingPaths.join(", ")}`);
  process.exit(1);
}

process.stdout.write(
  JSON.stringify({
    productName: manifest.productName,
    version: manifest.version,
    commit: manifest.commit ?? "unknown",
    createdAt: manifest.createdAt,
    includedPathCount: Array.isArray(manifest.includedPaths) ? manifest.includedPaths.length : 0
  })
);
EOF
)" || ccsw_release_fatal "Manifest includedPaths validation failed for ${artifact_path}"

manifest_summary="$(
  VERIFY_SUMMARY="${verify_summary}" \
  node -e 'const summary = JSON.parse(process.env.VERIFY_SUMMARY); process.stdout.write(`${summary.productName} version=${summary.version} commit=${summary.commit} createdAt=${summary.createdAt} includedPaths=${summary.includedPathCount}`);'
)"

ccsw_release_info "Checksum verified for ${artifact_path}"
ccsw_release_info "Manifest: ${manifest_summary}"
