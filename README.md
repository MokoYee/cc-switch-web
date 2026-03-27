# CC Switch Web

`CC Switch Web` 是当前采用的对外名称，仓库名统一为 `cc-switch-web`。
它参考 `cc-switch` 的能力模型，但交付形态是面向 Linux 宿主机的 `daemon-first + web console`。

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

`CC Switch Web` 采用的是“宿主机单端口 daemon + 内置控制台 + 本地持久化”的方案：

- 默认在宿主机本机启动一个 daemon
- 同一个端口同时承载管理 API 和内置 Control UI
- 控制令牌持久化保存在本地 SQLite
- Provider、应用绑定、代理策略写入 SQLite 后自动生成配置快照
- 可以导出配置包、重新导入、恢复最近快照
- `ccsw web` 仍然保留，但只作为调试/旁路控制台模式

这意味着它天然更适合：

- Linux 无头服务器
- 和 `Codex` / `Claude Code` / `Gemini CLI` 同机部署
- 本地优先、低依赖、可恢复的控制面产品形态

## 现在最核心的使用路径

当前产品优先解决的是这条最短主流程：

1. 启动 daemon
2. 生成或确认控制令牌
3. 接管本机 AI CLI
4. 让 CLI 请求走到本地代理
5. 验证请求是否真的已经打进来

换句话说，当前首先要做好的是“能装、能接管、能跑、能回滚”，而不是先把所有治理面板铺开。

当前已经具备的主流程能力：

- 单端口 daemon
- 内置 `/ui` 控制台
- 本地持久化控制令牌
- `systemd --user` 用户态服务辅助命令
- 宿主机 CLI 扫描
- `codex` 接管 / 回滚
- `claude-code` 接管 / 回滚
- `gemini-cli` / `opencode` / MCP 配置导入与同步能力矩阵
- Prompt Host Sync 与宿主机 Prompt 投放 / 回滚
- Prompt Host Sync 整批预览 / 整批执行
- Skill 交付能力矩阵与代理侧注入路径说明
- 宿主机接管预检与回滚备份
- OpenAI-compatible 直通、Anthropic 非流式 / 流式桥接
- 请求日志、审计事件、usage 统计、应用级日配额治理
- 工作区 / 会话有效上下文解析与请求级覆盖协议

## 当前还没做完的部分

当前重点已经从“演示页面”转到了“治理产品化”，还剩这些尾项没有完全收口：

- 更复杂的协议边界兼容，例如多工具并发流、图片返回内容桥接、thinking 能力协商
- 更完整的宿主机生态覆盖，尤其是 MCP 批量治理与更多 CLI 接管策略
- Skill 宿主机原生文件投放与更深的批量工作流
- 工作区 / 会话自动建档后的宿主机接管建议、团队共享与更细的审计闭环
- 趋势图、治理报表、批量操作等产品化体验增强
- 对外发布前的运行手册、指标体系和更多自动化验证

所以它现在适合：

- 作为可试跑的 Linux 宿主机 AI CLI 中台
- 作为开源方向验证与能力沉淀基线
- 作为后续真实代理网关控制面与宿主机治理面的基础

## 适合谁

- 在 Linux 服务器上同时使用多个 AI CLI 的开发者
- 想把 `Codex`、`Claude Code`、`Gemini CLI` 统一到一个控制入口的人
- 想把“配置切换、状态观察、恢复能力”做成本机基础设施的人
- 准备把 AI CLI 使用场景产品化、团队化的人

## 快速启动

默认 CLI 命令：

- 推荐短命令：`ccsw`
- 兼容别名：`cc-switch-web`、`ai-cli-switch`、`aicli-switch`
- 当前环境变量与 systemd 单元名仍沿用兼容前缀：`AICLI_SWITCH_*`、`ai-cli-switch.service`
- 本次归档后，CLI 进入维护态；后续新增治理能力默认只在 Web 控制台交付，CLI 只保留 `daemon` / `daemon service` / `web` 等运行入口与兼容命令。

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
# 或在安装到 PATH 后使用
ccsw daemon start
```

启动后访问：

- 登录页：`http://127.0.0.1:8787/`
- 内置控制台：`http://127.0.0.1:8787/ui/`

查看或轮换本地控制令牌：

```bash
node apps/cli/dist/index.js auth print-token
node apps/cli/dist/index.js auth rotate-token
# 或
ccsw auth print-token
```

按需打开独立调试控制台：

```bash
node apps/cli/dist/index.js web
# 或
ccsw web
```

## 宿主机主流程示例

最短路径可以按这个顺序：

```bash
npm install
npm run build
node apps/cli/dist/index.js daemon start
node apps/cli/dist/index.js auth print-token
node apps/cli/dist/index.js host setup codex
```

如果你想进一步压成一条主命令：

```bash
node apps/cli/dist/index.js quickstart codex
```

如果你要先看预检再决定是否接管：

```bash
node apps/cli/dist/index.js host preview codex
node apps/cli/dist/index.js host apply codex
```

如果需要回滚：

```bash
node apps/cli/dist/index.js host rollback codex
```

`claude-code` 同理：

```bash
node apps/cli/dist/index.js host setup claude-code
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
ccsw daemon service print
ccsw daemon service install
ccsw daemon service status
```

默认会写入：

- unit：`~/.config/systemd/user/ai-cli-switch.service`
- env：`~/.config/ai-cli-switch/daemon.env`

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
