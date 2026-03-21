# AI CLI Switch

`AI CLI Switch` 是本项目最终采用的产品名与对外名称，仓库与工程名统一为 `ai-cli-switch`。

这是一个面向 `Codex`、`Claude Code`、`Gemini CLI` 等 AI 编码工具用户的本机控制面与代理入口。  
目标不是再做一个“技术演示面板”，而是帮助用户在一台 Linux 宿主机上，把多种 AI CLI 的接入、切换、观察和后续代理能力统一起来。

## 它解决什么问题

如果你同时在用 `Codex`、`Claude Code`、`Gemini CLI`，很快会遇到这些问题：

- Provider、令牌、代理地址、超时配置分散在不同地方，切一次就要改一轮配置
- 同一台服务器上跑多个 AI CLI，缺少统一入口和统一控制面
- 切换主路由、备用路由、观察模式时，没有一个稳定的本机管理界面
- 出问题时看不到当前绑定关系，也很难快速恢复到上一个可用配置
- 很多项目只做桌面端，不适合 Linux 无头服务器场景

这个项目就是为这些问题服务的。

## 核心方案

`AI CLI Switch` 采用的是“宿主机单端口 daemon + 内置控制台 + 本地持久化”的方案：

- 默认在宿主机本机启动一个 daemon
- 同一个端口同时承载管理 API 和内置 Control UI
- 控制令牌持久化保存在本地 SQLite
- Provider、应用绑定、代理策略写入 SQLite 后自动生成配置快照
- 可以导出配置包、重新导入、恢复最近快照
- `ai-cli-switch web` 仍然保留，但只作为调试/旁路控制台模式

这意味着它天然更适合：

- Linux 无头服务器
- 和 `Codex` / `Claude Code` / `Gemini CLI` 同机部署
- 本地优先、低依赖、可恢复的控制面产品形态

## 当前能做什么

当前仓库已经不是纯骨架，已经具备一版可运行产品雏形：

- 单端口 daemon
- 内置登录页和控制台
- 本地持久化控制令牌
- Provider 管理
- App Binding 管理
- Proxy Policy 持久化
- Failover Chain 持久化与最小自动切换
- 配置快照自动生成
- 配置包导出 / 导入
- 最近快照恢复
- 宿主机 CLI 扫描骨架
- 中英双语基础设施
- `systemd --user` 用户态服务辅助命令
- OpenAI-compatible 最小代理直通
- Anthropic `messages` 到 OpenAI Chat Completions 的最小桥接
- Anthropic 文本流 / 工具调用 / 工具流的最小桥接
- 最小图片请求兼容与 thinking block 安全降级

## 当前还没做完的部分

当前重点已经从“演示页面”转到了“代理产品化”，但还没有完成这些能力：

- 更完整的 Anthropic / OpenAI 协议边界兼容
- 主动健康检查、半开恢复与更强的 failover 韧性
- 更细粒度的快照版本浏览与按版本恢复
- 请求日志、审计日志、指标体系
- 真实 CLI 接管与回滚闭环
- 更完整的自动化测试

所以它现在适合：

- 作为产品雏形试跑
- 作为开源方向验证
- 作为后续真实代理网关的控制面基础

## 适合谁

- 在 Linux 服务器上同时使用多个 AI CLI 的开发者
- 想把 `Codex`、`Claude Code`、`Gemini CLI` 统一到一个控制入口的人
- 想把“配置切换、状态观察、恢复能力”做成本机基础设施的人
- 准备把 AI CLI 使用场景产品化、团队化的人

## 快速启动

开发模式：

```bash
npm install
npm run dev:daemon
npm run dev:web
```

本机构建运行：

```bash
npm run build
node apps/cli/dist/index.js daemon start
```

启动后访问：

- 登录页：`http://127.0.0.1:8787/`
- 内置控制台：`http://127.0.0.1:8787/ui/`

查看或轮换本地控制令牌：

```bash
node apps/cli/dist/index.js auth print-token
node apps/cli/dist/index.js auth rotate-token
```

按需打开独立调试控制台：

```bash
node apps/cli/dist/index.js web
```

## Linux 宿主机运行模型

默认端口：

- Daemon 管理 API：`http://127.0.0.1:8787`
- Daemon 内置控制台：`http://127.0.0.1:8787/ui/`
- 独立调试控制台：`http://127.0.0.1:8788`

默认安全策略：

- Daemon 默认仅监听 `127.0.0.1`
- 控制台默认要求控制令牌登录
- 登录后使用 cookie 访问同端口 UI 和 API
- 控制令牌默认持久化到本地 SQLite
- 允许来源可通过 `ALLOWED_ORIGINS` 覆盖

环境变量示例：

```bash
AICLI_SWITCH_CONTROL_TOKEN=your-token
AICLI_SWITCH_ALLOWED_ORIGINS=http://localhost:<web-port>,http://<host>:<web-port>
AICLI_SWITCH_DAEMON_HOST=<daemon-host>
AICLI_SWITCH_DAEMON_PORT=<daemon-port>
AICLI_SWITCH_WEB_HOST=127.0.0.1
AICLI_SWITCH_WEB_PORT=<web-port>
AICLI_SWITCH_DATA_DIR=~/.ai-cli-switch
AICLI_SWITCH_DB_PATH=~/.ai-cli-switch/ai-cli-switch.sqlite
```

## systemd 用户态服务

在 Linux 宿主机上可以直接生成用户态服务配置：

```bash
node apps/cli/dist/index.js daemon service print
node apps/cli/dist/index.js daemon service install
node apps/cli/dist/index.js daemon service status
```

默认会写入：

- unit：`~/.config/systemd/user/ai-cli-switch.service`
- env：`~/.config/llm-lane/daemon.env`

## 仓库结构

```text
.
├── apps
│   ├── cli
│   ├── daemon
│   └── web
├── docs
├── packages
│   └── shared
├── tools
│   └── standalone
├── package.json
└── tsconfig.base.json
```
