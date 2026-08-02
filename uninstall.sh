#!/usr/bin/env bash

set -Eeuo pipefail

readonly CCSW_INSTALL_PREFIX="${HOME:-}/.local"
readonly CCSW_BIN_DIR="${CCSW_INSTALL_PREFIX}/bin"
readonly CCSW_PACKAGE_DIR="${CCSW_INSTALL_PREFIX}/lib/node_modules/cc-switch-web"
readonly CCSW_DATA_DIR="${HOME:-}/.cc-switch-web"
readonly CCSW_CONFIG_DIR="${HOME:-}/.config/cc-switch-web"
readonly CCSW_SYSTEMD_UNIT="${HOME:-}/.config/systemd/user/cc-switch-web.service"
readonly CCSW_SERVICE_NAME="cc-switch-web.service"

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

uninstall_service() {
  if ! command -v systemctl >/dev/null 2>&1 ||
    ! systemctl --user show-environment >/dev/null 2>&1; then
    rm -f -- "${CCSW_SYSTEMD_UNIT}"
    warn "systemd 用户会话不可用，已删除 unit 文件但无法确认进程状态 / unable to verify service process"
    return
  fi

  if [[ -f "${CCSW_SYSTEMD_UNIT}" ]] ||
    systemctl --user is-active --quiet "${CCSW_SERVICE_NAME}" 2>/dev/null; then
    systemctl --user disable --now "${CCSW_SERVICE_NAME}" ||
      warn "服务停止未完全成功，请检查 systemctl --user status / service stop needs review"
  fi

  rm -f -- "${CCSW_SYSTEMD_UNIT}"
  systemctl --user daemon-reload ||
    warn "systemd 配置刷新失败，请手动执行 daemon-reload / daemon-reload failed"
}

uninstall_package() {
  if command -v npm >/dev/null 2>&1; then
    npm uninstall --global --prefix "${CCSW_INSTALL_PREFIX}" cc-switch-web || true
  fi

  # 只清理一键安装器拥有的固定路径，不影响其他全局 npm 包或 Node.js。
  rm -rf -- "${CCSW_PACKAGE_DIR}"
  rm -f -- "${CCSW_BIN_DIR}/ccsw" "${CCSW_BIN_DIR}/cc-switch-web"
}

main() {
  local purge=false

  [[ "$(uname -s)" == "Linux" ]] || fatal "此卸载脚本仅支持 Linux / this uninstaller supports Linux only"
  [[ -n "${HOME:-}" ]] || fatal "HOME 未设置 / HOME is not set"

  case "${1:-}" in
    "")
      ;;
    --purge)
      purge=true
      ;;
    *)
      fatal "未知参数：${1}；可用参数：--purge / unknown option"
      ;;
  esac

  info "[1/4] 检查安装路径 / Install path: ${CCSW_INSTALL_PREFIX}"
  info "[2/4] 停止并移除用户服务 / Stopping and removing user service"
  uninstall_service

  info "[3/4] 卸载 cc-switch-web / Removing package"
  uninstall_package

  if [[ "${purge}" == "true" ]]; then
    info "[4/4] 删除数据与配置 / Purging data and configuration"
    rm -rf -- "${CCSW_DATA_DIR}" "${CCSW_CONFIG_DIR}"
  else
    info "[4/4] 保留数据与配置 / Preserving data and configuration"
    printf '  %s\n  %s\n' "${CCSW_DATA_DIR}" "${CCSW_CONFIG_DIR}"
  fi

  info "卸载完成；nvm、Node.js 和 ~/.local/bin 的 PATH 配置未改动 / Uninstall complete"
}

main "$@"
