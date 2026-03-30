# CC Switch Web Linux 单端口控制台设计

## 1. 产品目标

`CC Switch Web` 面向 Linux 宿主机场景，提供 AI CLI 工具的代理中台、供应商配置中台和按需控制台能力。
它参考 `cc-switch` 的能力模型，但不是桌面壳延伸，而是面向宿主机的 Web / daemon 形态。

当前主形态不是桌面端，也不是容器优先，而是：

- 宿主机原生运行
- `daemon-first`
- 单端口承载代理面与控制面
- 控制台默认内嵌在 daemon 的 `/ui`
- 默认只监听 `127.0.0.1`
- 所有新增用户可见能力默认按中英双语设计

## 2. 当前运行模型

### 2.1 单端口模型

- daemon 默认承载 API、代理入口和 `/ui` 控制台。
- Web 控制台不是独立长期必开的第二端口，而是内嵌静态资源。
- 控制面通过 token 或 UI 会话鉴权保护。
- 代理主链路和控制台展示逻辑仍保持模块隔离，避免控制面侵入代理链路。

### 2.2 启动方式

- 本地前台：`ccsw daemon start`
- Linux 用户服务：`ccsw daemon service install`
- 调试旁路控制台：`ccsw web`

其中：

- `daemon service` 以 `systemd --user` 为主。
- `web` 命令目前保留为调试/旁路控制台模式，不是主交付形态。
- 当前默认 CLI 短命令为 `ccsw`，旧命令别名仍可兼容。

### 2.3 默认安全边界

- 默认地址：`127.0.0.1:8787`
- 控制台与受保护 API 需要控制 token 或已登录 UI 会话
- `/metrics` 当前不走控制台登录态，默认依赖本机监听边界或反向代理 ACL 做额外保护
- 允许跨域来源可通过环境变量配置
- 监听地址和端口均可通过环境变量覆盖
- 环境变量与 `systemd` 单元名当前仍保留兼容前缀：`AICLI_SWITCH_*`、`ai-cli-switch.service`

### 2.4 请求级上下文协议

- 代理入口已支持按请求显式指定上下文，而不只依赖全局激活状态。
- 当前最小协议头：
  - `x-ai-cli-switch-workspace: <workspaceId>`
  - `x-ai-cli-switch-session: <sessionId>`
  - `x-ai-cli-switch-cwd: <currentWorkingDirectory>`
- 优先级：
  - 请求级 `session`
  - 请求级 `workspace`
  - 请求级 `cwd` 自动关联出的 `session`
  - 请求级 `cwd` 自动关联出的 `workspace`
  - 全局 active session
  - 全局 active workspace
  - app binding 默认绑定
- `cwd` 自动关联规则：
  - 优先命中当前 `appCode` 下最深层匹配的 `session.cwd`
  - 其次命中当前 `appCode` 下最深层匹配的 `workspace.rootPath`
  - 都没命中时才回退到全局 active context / app binding
- 当显式指定的 `session/workspace` 与当前请求的 `appCode` 不匹配时，代理会直接返回 `409`，避免静默错用上下文。
- 代理转发时会去掉用户传入的内部控制头，并重写为解析后的只读上下文头，供上游或调试链路观察。

## 3. 已落地能力

### 3.1 配置与持久化

- SQLite 持久化
- Provider / Binding / Proxy Policy / Failover Chain 数据模型
- 配置导入导出
- 配置快照
- 最近快照恢复
- 控制 token 持久化
- `auth print-token / rotate-token`

### 3.2 代理与故障转移

- OpenAI-compatible 最小直通
- Anthropic 非流式桥接
- Anthropic SSE 流式桥接
- Anthropic 工具调用结构桥接
- 基于绑定与策略的转发
- Active Context 驱动的 Provider 优先路由
- Active Context 驱动的 Prompt / Skill 请求注入
- 请求级显式 Workspace / Session 覆盖
- Failover Chain 切换
- 熔断冷却
- Provider 健康探活
- 自动恢复与事件记录

### 3.3 宿主机 CLI 接管

- Host discovery 扫描
- Host capability registry
- 支持矩阵 API / CLI
- `codex` 真实 apply / rollback
- `claude-code` 真实 apply / rollback
- 前台临时接管生命周期
  - daemon 正常退出时自动回滚 `foreground-session` 宿主机接管
  - daemon 下次启动时自动恢复上次异常退出残留的临时接管
  - Dashboard bootstrap 暴露启动自动恢复摘要，控制台可直接跟进宿主机审计
- 事件持久化
- Prompt Host Sync 能力矩阵
- Skill Delivery 能力矩阵
- `codex` 宿主机 Prompt 文件 apply / rollback
- `claude-code` 宿主机 Prompt 文件 apply / rollback
- Prompt Host Sync 整批预览 / 整批 apply
- Active Context 优先、单候选 Prompt 回退、歧义阻断
- Prompt Host Sync 沿用备份 / 状态文件 / 回滚模型
- Prompt / Skill 当前仍分层处理：Prompt 可投放宿主机，Skill 继续保持代理侧注入
- `codex` / `claude-code` / `gemini-cli` 当前标记为 `proxy-only`
- `opencode` / `openclaw` 当前标记为 `planned`

当前宿主机支持矩阵原则：

- `managed`：已具备受管接管能力
- `inspect-only`：只识别本机状态，不猜测接管方式
- `planned`：已进入产品模型，但未承诺立即接管

### 3.4 可观测性

- 请求日志持久化
- 请求日志筛选与分页查询
- Usage 记录持久化
- Usage 汇总与按应用 / Provider / 模型聚合
- 统一审计事件流
- Host integration / provider health / proxy request 聚合审计
- Prometheus `/metrics` 导出
  - daemon 运行态、Proxy runtime、Provider 诊断、MCP 漂移、Snapshot 版本等基础 gauge
- Service Doctor
  - `systemd --user`、unit、env、runtime 偏差检查
  - 控制台运行治理面直接暴露校验清单与恢复步骤
- CLI 查询入口
- 基础运行时状态查询

### 3.5 MCP 基础模块

- MCP Server 数据模型
- App 与 MCP Server 绑定模型
- SQLite 持久化
- 配置快照、导入导出集成
- MCP Host Sync 能力矩阵
- 从 `codex` / `claude-code` 现有配置导入 MCP
- 从 `gemini-cli` / `opencode` 现有配置导入 MCP
- `codex` MCP 配置同步与回滚
- `claude-code` MCP 配置同步与回滚
- `gemini-cli` MCP 配置同步与回滚
- `opencode` MCP 配置同步与回滚
- MCP Host Sync 整批 apply / rollback
- MCP CLI 查询、导入、Host Sync 命令
- 控制台 MCP 面板、基础表单与编辑回填
- 导入预览支持字段级前后值对比
- MCP Runtime 治理预览 / 修复
- MCP 基线校验历史 API 与控制台跟进视图
- MCP 审计时间线视图
- MCP 审计事件已纳入统一事件流

### 3.6 控制台基础设施

- `/ui` 登录页与控制台壳
- Dashboard 基础页面
- QuickStart 项目接入工作台
- Runtime Governance / Service Doctor / Startup Recovery 跟进卡
- MCP 校验历史与治理跟进行动入口
- 中英双语基础设施
- 前端目录标准化：`app` / `features` / `shared`

### 3.7 工作区自动发现

- 支持扫描宿主机项目目录生成 workspace 候选
- 支持识别 `.git`、`package.json`、`pyproject.toml`、`Cargo.toml`、`go.mod`、`pom.xml` 等常见工程标记
- 支持识别 `.codex`、`.claude`、`.gemini`、`.opencode`、`AGENTS.md`、`CLAUDE.md` 等 AI CLI 线索并推断 `appCode`
- 支持将已有 session `cwd` 与已有 workspace `rootPath` 一并纳入候选去重
- 支持把嵌套 session `cwd` 自动折叠到最近项目根，避免把子目录误建成独立 workspace
- 支持一键导入候选为正式 workspace
- 支持整批导入候选为正式 workspace，并自动挂回历史 session
- 支持基于请求 `cwd` 自动归并到最近的 session / workspace
- 支持在“同 workspace 仅存在一个活跃 session”时自动复用该 session，避免请求流量持续膨胀出重复 session
- CLI：
  - `ccsw workspace discover [--roots <a,b>] [--depth <n>]`
  - `ccsw workspace import --root <path> ...`
  - `ccsw workspace import-auto [--roots <a,b>] [--depth <n>]`
- Active Context 解析：
  - `ccsw active-context resolve <appCode> [--cwd <path>]`
- API：
- `GET /api/v1/workspace-discovery`
- `POST /api/v1/workspace-discovery/import`
- `POST /api/v1/workspace-discovery/import-batch`
- `GET /api/v1/active-context/effective/:appCode?cwd=...`
