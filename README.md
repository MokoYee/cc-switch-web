# CC Switch Web

`CC Switch Web` 是一个面向 Linux 的 AI CLI 配置与代理控制台。
它统一管理 `Codex`、`Claude Code` 的接入、切换、观测与恢复，并支持发现和同步 `Gemini CLI`、`OpenCode` 的 MCP 配置。

如果你的机器上同时跑多个 AI CLI，配置分散、切换麻烦、故障难排、回滚靠手工，这个项目就是为这类场景准备的。

## 它解决什么问题

在真实使用里，AI CLI 往往会很快从“单机小工具”变成“本机基础设施”，常见问题包括：

- 不同 CLI 的 Provider、令牌、代理和超时配置分散，切换成本高
- 同一台机器上运行多个 AI CLI，没有统一的控制入口
- 请求是否真的走到了本地代理、当前到底命中了哪条配置链路，很难看清
- 一旦改坏了配置，缺少稳定的恢复与回滚能力
- 现有方案很多偏桌面端，不适合 Linux 无头服务器

`CC Switch Web` 的目标，就是把这些零散动作收敛成一个可持续使用的本地控制面。

## 核心价值

- 统一入口：把多种 AI CLI 的接入和切换收敛到一个控制台
- 本地优先：数据、控制令牌和快照都保存在本机，便于长期运行
- 可观测：能看到当前绑定关系、请求、用量、审计和运行状态
- 可恢复：支持快照、导入导出、接管回滚和异常后的自动恢复

## 当前能做什么

- 提供单端口 daemon 与内置 Web 控制台
- 管理 Provider、应用绑定、代理策略和故障转移
- 支持 Provider 级模型映射与默认模型：把 `Claude Code` / `Codex` 请求的模型名改写成第三方上游真实可用的模型
- 为 `Codex` 提供 OpenAI Responses → Chat Completions 桥接：`wire_api = "responses"` 也能接只支持 `chat/completions` 的第三方 Provider
- 为 `Claude Code` 提供 Anthropic → OpenAI 兼容桥接（文本 / SSE 流式 / 工具调用 / 图片 / thinking / `count_tokens` 本地估算）
- 接管并回滚 `codex`、`claude-code` 等本机 CLI 配置
- 为 `codex`、`claude-code` 提供 `file-rewrite` / `environment-override` 双接管模式
- 对 Provider 健康检查、自动切换和恢复验证提供更稳定的状态解释
- 控制台内置常用 Provider 预设（DeepSeek、Moonshot、智谱、Qwen、SiliconFlow、OpenRouter、官方 OpenAI / Anthropic）
- 管理 MCP 与 Prompt 的导入、预览、发布和回滚
- 提供 usage 统计、审计事件、运行治理与 `/metrics`
- 提供配置快照、导入导出和最近版本恢复

当前不提供 Gemini API / Gateway 代理，因此 `Gemini CLI` 仅支持配置发现和 MCP 同步，不支持代理接管。

## 适合谁

- 在 Linux 服务器上长期使用多个 AI CLI 的个人开发者
- 想把 `Codex`、`Claude Code`、`Gemini CLI` 收敛到统一入口的团队
- 需要把“切换、观察、恢复”做成本机稳定能力的人
- 准备把 AI CLI 使用环境做成可交付运行面的场景

## 快速安装

一键安装或升级到最新版本：

```bash
curl -fsSL https://raw.githubusercontent.com/MokoYee/cc-switch-web/main/install.sh | bash
```

脚本使用当前用户安装到 `~/.local`，数据保存在 `~/.cc-switch-web`。安装完成后会自动启动并输出内网管理地址；如果系统不支持用户服务，则输出手动启动命令。

查看登录令牌：

```bash
~/.local/bin/ccsw auth print-token
```

<details>
<summary>卸载 CC Switch Web</summary>

默认卸载会停止用户服务并移除程序，但保留数据库、令牌、快照以及 Node.js：

```bash
curl -fsSL https://raw.githubusercontent.com/MokoYee/cc-switch-web/main/uninstall.sh | bash
```

需要同时删除 `~/.cc-switch-web` 数据和项目配置时，显式执行：

```bash
curl -fsSL https://raw.githubusercontent.com/MokoYee/cc-switch-web/main/uninstall.sh | bash -s -- --purge
```

</details>

### 手动安装

```bash
npm install -g cc-switch-web
ccsw daemon start
```

无需全局安装也可以直接运行：

```bash
npx cc-switch-web daemon start
```

### 从源码运行

```bash
npm install
npm run build
node apps/cli/dist/index.js daemon start
```

手动启动后默认从本机访问：

- 登录页：`http://localhost:8787/`
- 控制台：`http://localhost:8787/ui/`
- Metrics：`http://localhost:8787/metrics`

一键安装后请使用脚本输出的内网管理地址。

查看控制令牌：

```bash
ccsw auth print-token
```

接管 `codex`：

```bash
ccsw host setup codex
```

接管 `claude-code`：

```bash
ccsw host setup claude-code
```

如果需要先预览再决定是否接管：

```bash
ccsw host preview codex
ccsw host apply codex
```

如果你不想先改本机配置文件，可以先走环境变量接管：

```bash
ccsw host preview codex --mode environment-override
ccsw host apply codex --mode environment-override
```

`environment-override` 模式会生成受管脚本并返回 `source` / 清理命令，不会自动修改你的 shell rc 文件。

如果需要回滚：

```bash
ccsw host rollback codex
```

## Linux 运行方式

默认运行模型是：

- 本机 daemon
- 内置 `/ui` 控制台
- 本地 SQLite 持久化
- `systemd --user` 作为长期运行方式

常用命令：

```bash
ccsw daemon service print
ccsw daemon service install
ccsw daemon service status
ccsw daemon service logs --lines 200
ccsw daemon service follow --lines 100
ccsw daemon service logs --since "today" --grep "error|warn"
ccsw daemon service logs --boot -1 --priority warning..alert
```

当前稳定命名：

- CLI 命令：`ccsw`、`cc-switch-web`
- 环境变量前缀：`CCSW_*`
- `systemd` unit：`cc-switch-web.service`

## 运行要求

- Linux
- Node.js `20.19.0` 或更高版本
- 长期运行建议使用支持用户会话的 `systemd --user`
- 手动启动默认只监听本机；一键安装服务监听所有网卡，必须通过防火墙将 TCP `8787` 限制在可信内网

## 公开文档

- [架构与功能说明](./docs/linux-web-console-design.md)
- [Linux 运行与回滚手册](./docs/linux-operations-runbook.md)
