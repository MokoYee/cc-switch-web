# CC Switch Web

`CC Switch Web` 是一个面向 Linux 宿主机的 AI CLI 控制台。  
它用来统一管理 `Codex`、`Claude Code`、`Gemini CLI` 等工具在本机上的接入、切换、观测与恢复。

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
- 接管并回滚 `codex`、`claude-code` 等本机 CLI 配置
- 管理 MCP 与 Prompt 的导入、预览、发布和回滚
- 提供 usage 统计、审计事件、运行治理与 `/metrics`
- 提供配置快照、导入导出和最近版本恢复

## 适合谁

- 在 Linux 服务器上长期使用多个 AI CLI 的个人开发者
- 想把 `Codex`、`Claude Code`、`Gemini CLI` 收敛到统一入口的团队
- 需要把“切换、观察、恢复”做成本机稳定能力的人
- 准备把 AI CLI 使用环境做成可交付运行面的场景

## 典型使用路径

最短路径通常只有四步：

1. 启动 daemon
2. 登录控制台或获取控制令牌
3. 接管本机 AI CLI
4. 验证请求、观察状态，必要时回滚

它优先解决的是“能装、能接管、能跑、能看、能恢复”，而不是只做一个演示页面。

## 快速启动

通过 npm 直接安装：

```bash
npm install -g cc-switch-web
```

或直接临时执行：

```bash
npx cc-switch-web daemon start
```

安装完成后，CLI 命令仍然是：

```bash
ccsw
```

源码方式安装依赖并启动：

安装依赖并启动：

```bash
npm install
npm run build
ccsw daemon start
```

如果当前还没有安装到 PATH，也可以直接用：

```bash
node apps/cli/dist/index.js daemon start
```

启动后默认访问：

- 登录页：`http://127.0.0.1:8787/`
- 控制台：`http://127.0.0.1:8787/ui/`
- Metrics：`http://127.0.0.1:8787/metrics`

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
```

兼容命令与历史前缀仍保留：

- CLI 别名：`cc-switch-web`、`ai-cli-switch`、`aicli-switch`
- 环境变量前缀：`AICLI_SWITCH_*`
- `systemd` unit：`ai-cli-switch.service`

## 公开文档

- [Linux 单端口控制台设计](./docs/linux-web-console-design.md)
- [Linux 运行与回滚手册](./docs/linux-operations-runbook.md)
