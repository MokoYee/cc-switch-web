#!/usr/bin/env bash

set -Eeuo pipefail

readonly CCSW_MIN_NODE_MAJOR=20
readonly CCSW_MIN_NODE_MINOR=19
readonly CCSW_FALLBACK_NODE_VERSION=24
readonly CCSW_NVM_VERSION="v0.40.6"
readonly CCSW_INSTALL_PREFIX="${HOME:-}/.local"
readonly CCSW_BIN_DIR="${CCSW_INSTALL_PREFIX}/bin"
readonly CCSW_DAEMON_PORT=8787

info() {
  printf '[CC Switch Web] %s\n' "$*"
}

warn() {
  printf '[CC Switch Web] WARNING: %s\n' "$*" >&2
}

fatal() {
  printf '[CC Switch Web] ERROR: %s\n' "$*" >&2
  exit 1
}

download() {
  local url="$1"

  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location "${url}"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget --quiet --output-document=- "${url}"
    return
  fi

  fatal "需要 curl 或 wget 才能安装 Node.js / curl or wget is required to install Node.js"
}

node_is_supported() {
  command -v node >/dev/null 2>&1 &&
    command -v npm >/dev/null 2>&1 &&
    node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > ${CCSW_MIN_NODE_MAJOR} || (major === ${CCSW_MIN_NODE_MAJOR} && minor >= ${CCSW_MIN_NODE_MINOR}) ? 0 : 1);"
}

resolve_profile_path() {
  case "${SHELL:-}" in
    */zsh)
      printf '%s/.zshrc\n' "${HOME}"
      ;;
    */bash)
      printf '%s/.bashrc\n' "${HOME}"
      ;;
    *)
      printf '%s/.profile\n' "${HOME}"
      ;;
  esac
}

resolve_nvm_dir() {
  if [[ -n "${NVM_DIR:-}" ]]; then
    printf '%s\n' "${NVM_DIR}"
  elif [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
    printf '%s/nvm\n' "${XDG_CONFIG_HOME}"
  else
    printf '%s/.nvm\n' "${HOME}"
  fi
}

install_node() {
  local profile_path
  local nvm_dir

  profile_path="$(resolve_profile_path)"
  nvm_dir="$(resolve_nvm_dir)"
  export NVM_DIR="${nvm_dir}"

  if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
    info "Node.js 不可用，正在安装 nvm ${CCSW_NVM_VERSION} / Installing nvm ${CCSW_NVM_VERSION}"
    download "https://raw.githubusercontent.com/nvm-sh/nvm/${CCSW_NVM_VERSION}/install.sh" |
      PROFILE="${profile_path}" bash
  fi

  [[ -s "${NVM_DIR}/nvm.sh" ]] || fatal "nvm 安装失败 / nvm installation failed"

  # nvm 是 Shell 函数，必须在当前安装进程中加载后才能继续安装 Node.js。
  # shellcheck source=/dev/null
  source "${NVM_DIR}/nvm.sh"
  info "正在安装 Node.js ${CCSW_FALLBACK_NODE_VERSION} / Installing Node.js ${CCSW_FALLBACK_NODE_VERSION}"
  nvm install "${CCSW_FALLBACK_NODE_VERSION}"
  nvm alias default "${CCSW_FALLBACK_NODE_VERSION}" >/dev/null
  nvm use --silent "${CCSW_FALLBACK_NODE_VERSION}"
}

ensure_cli_path() {
  local path_marker="# CC Switch Web CLI"
  local profile_path

  export PATH="${CCSW_BIN_DIR}:${PATH}"
  profile_path="$(resolve_profile_path)"

  if [[ -f "${profile_path}" ]] && grep -Fq "${path_marker}" "${profile_path}"; then
    return
  fi

  touch "${profile_path}"
  printf '\n%s\nexport PATH="$HOME/.local/bin:$PATH"\n' "${path_marker}" >> "${profile_path}"
  info "已将 ~/.local/bin 写入 ${profile_path}，新 Shell 会自动生效 / PATH updated for new shells"
}

is_private_ipv4() {
  case "$1" in
    10.* | 192.168.* | 172.1[6-9].* | 172.2[0-9].* | 172.3[01].*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

detect_private_ipv4() {
  local address
  local addresses

  if command -v ip >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then
    address="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (index = 1; index <= NF; index += 1) if ($index == "src") {print $(index + 1); exit}}' || true)"
    if [[ -n "${address}" ]] && is_private_ipv4 "${address}"; then
      printf '%s\n' "${address}"
      return
    fi
  fi

  if command -v hostname >/dev/null 2>&1; then
    addresses="$(hostname -I 2>/dev/null || true)"
    for address in ${addresses}; do
      if is_private_ipv4 "${address}"; then
        printf '%s\n' "${address}"
        return
      fi
    done
  fi

  return 1
}

daemon_is_ready() {
  CCSW_DAEMON_HOST=127.0.0.1 \
    CCSW_DAEMON_PORT="${CCSW_DAEMON_PORT}" \
    "${CCSW_BIN_DIR}/ccsw" status >/dev/null 2>&1
}

wait_for_daemon() {
  local attempt=1

  while (( attempt <= 20 )); do
    if daemon_is_ready; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  return 1
}

print_linger_guidance() {
  local linger_status

  if ! command -v loginctl >/dev/null 2>&1; then
    return
  fi

  linger_status="$(loginctl show-user "$(id -un)" --property=Linger --value 2>/dev/null || true)"
  if [[ "${linger_status}" == "yes" ]]; then
    return
  fi

  warn "当前用户未启用 linger，退出登录或重启后服务可能不会自动运行 / systemd linger is disabled"
  printf '保持用户服务长期运行 / Keep the user service running after logout:\n  sudo loginctl enable-linger %s\n\n' "$(id -un)"
}

install_and_start_service() {
  local service_was_active=false

  if ! command -v systemctl >/dev/null 2>&1 ||
    ! systemctl --user show-environment >/dev/null 2>&1; then
    warn "systemd 用户会话不可用，已跳过自动启动 / systemd user session is unavailable"
    return 1
  fi

  if systemctl --user is-active --quiet cc-switch-web.service 2>/dev/null; then
    service_was_active=true
  fi

  if ! CCSW_DAEMON_HOST=0.0.0.0 \
    CCSW_DAEMON_PORT="${CCSW_DAEMON_PORT}" \
    "${CCSW_BIN_DIR}/ccsw" daemon service install; then
    warn "用户服务安装失败，已保留 CLI 安装 / service setup failed; CLI remains installed"
    return 1
  fi

  if [[ "${service_was_active}" == "true" ]]; then
    "${CCSW_BIN_DIR}/ccsw" daemon service restart
  fi

  return 0
}

main() {
  [[ "$(uname -s)" == "Linux" ]] || fatal "此安装脚本仅支持 Linux / this installer supports Linux only"
  [[ -n "${HOME:-}" ]] || fatal "HOME 未设置 / HOME is not set"

  info "[1/6] 检查安装环境 / Checking environment"
  info "安装目标 / Package: cc-switch-web@latest"
  info "安装路径 / Install path: ${CCSW_INSTALL_PREFIX}"
  info "数据路径 / Data path: ${HOME}/.cc-switch-web"
  info "服务监听 / Listen address: 0.0.0.0:${CCSW_DAEMON_PORT}"

  if [[ "$(id -u)" == "0" ]]; then
    warn "当前以 root 安装，配置和服务将属于 root 用户 / installing for the root user"
  fi

  info "[2/6] 检查 Node.js / Checking Node.js"
  if ! node_is_supported; then
    install_node
  else
    info "Node.js $(node --version) 已满足要求 / Node.js is ready"
  fi

  node_is_supported || fatal "需要 Node.js 20.19.0 或更高版本 / Node.js 20.19.0 or newer is required"

  info "[3/6] 安装 cc-switch-web@latest / Installing package"
  mkdir -p "${CCSW_INSTALL_PREFIX}"
  npm install --global --prefix "${CCSW_INSTALL_PREFIX}" cc-switch-web@latest

  info "[4/6] 配置命令并校验安装 / Configuring PATH and verifying CLI"
  ensure_cli_path
  [[ -x "${CCSW_BIN_DIR}/ccsw" ]] || fatal "ccsw 命令未生成 / ccsw command was not created"
  "${CCSW_BIN_DIR}/ccsw" --help >/dev/null

  info "[5/6] 安装并启动用户服务 / Installing and starting user service"
  if install_and_start_service; then
    local private_ip

    print_linger_guidance
    info "[6/6] 等待服务就绪 / Waiting for daemon readiness"
    if wait_for_daemon; then
      private_ip="$(detect_private_ipv4 || true)"

      info "安装并启动完成 / Installation and startup complete"
      if [[ -n "${private_ip}" ]]; then
        printf '\nWeb 管理页面 / Web console:\n  http://%s:%s/\n' "${private_ip}" "${CCSW_DAEMON_PORT}"
      else
        warn "未检测到私网 IPv4，请使用服务器实际内网 IP / no private IPv4 detected"
        printf '\nWeb 管理页面 / Web console:\n  http://<server-private-ip>:%s/\n' "${CCSW_DAEMON_PORT}"
      fi
      printf '\n查看登录令牌 / Print login token:\n  %s auth print-token\n' "${CCSW_BIN_DIR}/ccsw"
      printf '\n服务状态 / Service status:\n  %s daemon service status\n' "${CCSW_BIN_DIR}/ccsw"
      printf '\n安全提示 / Security:\n  仅向可信内网开放 TCP %s，页面需要控制令牌登录。\n\n' "${CCSW_DAEMON_PORT}"
      return
    fi

    warn "服务未在 20 秒内就绪，请查看日志 / daemon did not become ready within 20 seconds"
    printf '\n查看日志 / View logs:\n  %s daemon service logs --lines 200\n\n' "${CCSW_BIN_DIR}/ccsw"
    return
  fi

  info "安装完成，服务尚未启动 / Installation complete; daemon is not running"
  printf '\n手动启动 / Start manually:\n  CCSW_DAEMON_HOST=0.0.0.0 %s daemon start\n\n' "${CCSW_BIN_DIR}/ccsw"
}

main "$@"
