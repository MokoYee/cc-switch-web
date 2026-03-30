#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

usage() {
  cat <<'EOF'
Usage:
  bash tools/ops/verify-host.sh

What it does:
  1. Validate daemon service status and service doctor output
  2. Probe /health, /ui/, and /metrics on the current daemon endpoint
  3. Fail fast when the deployed host is not in a delivery-ready state
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  ccsw_ops_fatal "verify-host.sh does not accept extra arguments. Use --help for usage."
fi

ccsw_ops_ensure_repo_root
ccsw_ops_ensure_command node
ccsw_ops_ensure_command curl
ccsw_ops_ensure_command mktemp

[[ -f "${CCSW_OPS_CLI_ENTRY}" ]] || ccsw_ops_fatal "CLI dist entry missing under ${CCSW_OPS_REPO_ROOT}. Run npm run build or deploy an extracted release bundle first."

readonly CCSW_OPS_VERIFY_HOST="${CCSW_DAEMON_HOST:-${CCSW_HOST:-127.0.0.1}}"
readonly CCSW_OPS_VERIFY_PORT="${CCSW_DAEMON_PORT:-${CCSW_PORT:-8787}}"
readonly CCSW_OPS_VERIFY_BASE_URL="http://${CCSW_OPS_VERIFY_HOST}:${CCSW_OPS_VERIFY_PORT}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

status_json="${tmp_dir}/service-status.json"
doctor_json="${tmp_dir}/service-doctor.json"
health_json="${tmp_dir}/health.json"
ui_html="${tmp_dir}/ui.html"
metrics_txt="${tmp_dir}/metrics.txt"

ccsw_ops_info "Collecting daemon service status"
node "${CCSW_OPS_CLI_ENTRY}" daemon service status > "${status_json}"

STATUS_JSON_PATH="${status_json}" node <<'EOF'
const fs = require("fs");

const payload = JSON.parse(fs.readFileSync(process.env.STATUS_JSON_PATH, "utf8"));
const failures = [];

if (payload.systemdAvailable !== true) {
  failures.push("systemd --user unavailable");
}
if (payload.loadState !== "loaded") {
  failures.push(`unexpected loadState=${payload.loadState ?? "unknown"}`);
}
if (payload.active !== true || payload.activeState !== "active") {
  failures.push(`service not active (active=${payload.active}, activeState=${payload.activeState ?? "unknown"})`);
}
if (payload.envFileExists !== true) {
  failures.push("daemon service env file missing");
}

if (failures.length > 0) {
  console.error(`[ccsw-ops] ERROR: service status verification failed: ${failures.join("; ")}`);
  process.exit(1);
}

console.log(
  `[ccsw-ops] service status ok: unit=${payload.unitPath} pid=${payload.execMainPid ?? "n/a"}`
);
EOF

ccsw_ops_info "Collecting daemon service doctor"
node "${CCSW_OPS_CLI_ENTRY}" daemon service doctor > "${doctor_json}"

DOCTOR_JSON_PATH="${doctor_json}" node <<'EOF'
const fs = require("fs");

const payload = JSON.parse(fs.readFileSync(process.env.DOCTOR_JSON_PATH, "utf8"));
const checks = payload.checks ?? {};
const failures = [];

if (checks.systemd?.available !== true) {
  failures.push(`systemd check failed: ${checks.systemd?.detail ?? "unavailable"}`);
}
if (checks.files?.envExists !== true) {
  failures.push("service env file missing");
}
if (checks.files?.envInSync !== true) {
  failures.push("service env file drift detected");
}
if (checks.service?.knownToSystemd !== true) {
  failures.push("service is unknown to systemd --user");
}
if (checks.service?.active !== true) {
  failures.push(`service inactive: ${checks.service?.activeState ?? "unknown"}`);
}
if (checks.runtime?.reachable !== true) {
  failures.push(`daemon health endpoint unreachable: ${checks.runtime?.reason ?? "unknown"}`);
}
if (checks.runtime?.authenticated !== true) {
  failures.push(`daemon protected runtime unavailable: ${checks.runtime?.reason ?? "unknown"}`);
}
if (checks.runtime?.daemonMatchesDesired !== true) {
  failures.push("daemon runtime differs from desired service env");
}

if (failures.length > 0) {
  console.error(`[ccsw-ops] ERROR: service doctor verification failed: ${failures.join("; ")}`);
  process.exit(1);
}

console.log(
  `[ccsw-ops] service doctor ok: runtime=${checks.runtime.daemonRuntime.runMode} ${checks.runtime.daemonRuntime.daemonHost}:${checks.runtime.daemonRuntime.daemonPort}`
);
EOF

ccsw_ops_info "Probing ${CCSW_OPS_VERIFY_BASE_URL}/health"
curl --fail --silent --show-error "${CCSW_OPS_VERIFY_BASE_URL}/health" > "${health_json}"

HEALTH_JSON_PATH="${health_json}" node <<'EOF'
const fs = require("fs");

const payload = JSON.parse(fs.readFileSync(process.env.HEALTH_JSON_PATH, "utf8"));
if (payload.status !== "ok") {
  console.error(`[ccsw-ops] ERROR: /health returned unexpected status=${payload.status ?? "unknown"}`);
  process.exit(1);
}

console.log(`[ccsw-ops] health ok: status=${payload.status}`);
EOF

ccsw_ops_info "Probing ${CCSW_OPS_VERIFY_BASE_URL}/ui/"
curl --fail --silent --show-error "${CCSW_OPS_VERIFY_BASE_URL}/ui/" > "${ui_html}"
grep -q "CC Switch Web" "${ui_html}" || ccsw_ops_fatal "/ui/ response does not look like the embedded console"
ccsw_ops_info "ui ok: embedded console is reachable"

ccsw_ops_info "Probing ${CCSW_OPS_VERIFY_BASE_URL}/metrics"
curl --fail --silent --show-error "${CCSW_OPS_VERIFY_BASE_URL}/metrics" > "${metrics_txt}"
grep -q "ccsw_proxy_runtime_state" "${metrics_txt}" || ccsw_ops_fatal "/metrics response missing ccsw_proxy_runtime_state"
grep -q "ccsw_latest_snapshot_version" "${metrics_txt}" || ccsw_ops_fatal "/metrics response missing ccsw_latest_snapshot_version"
ccsw_ops_info "metrics ok: Prometheus payload is reachable"

ccsw_ops_info "Host verification completed."
