# CC Switch Web 架构与功能说明

## 1. 项目定位

`CC Switch Web` 面向 Linux，提供 AI CLI 工具的代理中台、供应商配置中台和按需控制台能力。
它参考 `cc-switch` 的能力模型，但不是桌面壳延伸，而是 Linux Web / daemon 形态。

当前主形态不是桌面端，也不是容器优先，而是：

- Linux 原生运行
- `daemon-first`
- 单端口承载代理面与控制面
- 控制台默认内嵌在 daemon 的 `/ui`
- 默认只监听 `127.0.0.1`
- 控制台提供中文和英文界面

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
- 当前稳定 CLI 命令为 `ccsw`，并提供同品牌全名命令 `cc-switch-web`。

### 2.3 默认安全边界

- 手动启动默认地址：`127.0.0.1:8787`
- 一键安装的用户服务监听 `0.0.0.0:8787`，并通过私网 IPv4 提供管理入口
- 控制台与受保护 API 需要控制 token 或已登录 UI 会话
- `/metrics` 当前不走控制台登录态；使用一键安装时必须通过防火墙限制 TCP `8787` 的内网访问范围
- 允许跨域来源可通过环境变量配置
- 监听地址和端口均可通过环境变量覆盖
- 环境变量与 `systemd` 单元名统一采用：`CCSW_*`、`cc-switch-web.service`

### 2.4 请求级上下文协议

- 代理入口已支持按请求显式指定上下文，而不只依赖全局激活状态。
- 当前最小协议头：
  - `x-cc-switch-web-workspace: <workspaceId>`
  - `x-cc-switch-web-session: <sessionId>`
  - `x-cc-switch-web-cwd: <currentWorkingDirectory>`
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

## 3. 功能说明

### 3.1 配置与持久化

- SQLite 持久化
- Provider / Binding / Proxy Policy / Failover Chain 数据模型
- 配置导入导出
- 配置快照
- 最近快照恢复
- 控制 token 持久化
- `auth print-token / rotate-token`

### 3.2 代理与故障转移

- OpenAI-compatible 请求直通
- Anthropic 非流式桥接
- Anthropic SSE 流式桥接
- Anthropic 工具调用结构桥接
- OpenAI Responses → Chat Completions 桥接（Codex 主链路）
  - 非流式请求 / 响应结构转换
  - SSE 事件流转换（文本增量、工具调用增量、usage）
  - Provider 级 `responsesApiMode`：`auto`（官方 OpenAI 直通、其余桥接）/ `passthrough` / `bridge`
- Provider 级模型映射与默认模型
  - `modelMapping` 精确改写请求模型名
  - `defaultModel` 兜底改写未命中映射的模型名
  - 覆盖 Anthropic 桥接、`chat/completions`、`responses` 与 `messages` 直通
- Claude Code `count_tokens` 兼容
  - OpenAI 兼容上游不转发，由代理本地估算并返回 `input_tokens`
- Anthropic 上游凭据规范化
  - 转发时剥离入站 `x-api-key` 占位凭据
  - 对 anthropic Provider 自动补 `x-api-key` 与 `anthropic-version`
- Anthropic 错误结构桥接：上游失败时返回标准 `{"type":"error"}` 结构
- 基于绑定与策略的转发
- Active Context 驱动的 Provider 优先路由
- Active Context 驱动的 Prompt / Skill 请求注入
- 请求级显式 Workspace / Session 覆盖
- Failover Chain 切换
- 熔断冷却
- ProviderType 差异化健康探活
- 恢复验证窗口与连续成功阈值
- 自动恢复与事件记录
- 控制台 / CLI 可解释“恢复验证中”而不是把一次偶发成功误判为已恢复

### 3.3 本机 CLI 接管

- Host discovery 扫描
- Host capability registry
- 支持矩阵 API / CLI
- `codex` 文件配置接管与回滚
- `claude-code` 文件配置接管与回滚
- `codex` 环境变量接管预览 / apply / rollback
- `claude-code` 环境变量接管预览 / apply / rollback
- 前台临时接管生命周期
  - daemon 正常退出时自动回滚 `foreground-session` 本机接管
  - daemon 下次启动时自动恢复上次异常退出残留的临时接管
  - Dashboard bootstrap 暴露启动自动恢复摘要，控制台可直接跟进本机审计
- 事件持久化
- Prompt Host Sync 能力矩阵
- Skill Delivery 能力矩阵
- `codex` 本机 Prompt 文件 apply / rollback
- `claude-code` 本机 Prompt 文件 apply / rollback
- Prompt Host Sync 整批预览 / 整批 apply
- Active Context 优先、单候选 Prompt 回退、歧义阻断
- Prompt Host Sync 沿用备份 / 状态文件 / 回滚模型
- Prompt / Skill 分层处理：Prompt 可投放本机，Skill 保持代理侧注入
- `codex` / `claude-code` 支持文件配置和环境变量两种接管方式
- `gemini-cli` 支持配置发现和 MCP 同步，不支持代理接管

当前环境变量接管原则：

- `environment-override` 通过受管脚本导出代理相关环境变量
- apply 会返回激活命令和清理命令，用户显式 `source` 后生效
- 不自动修改 shell rc，不自动污染用户登录环境
- `gemini-cli` 当前仍只做发现，不承诺 env takeover 可用，因为代理主链路尚未提供 Gemini API / Gateway 适配

本机支持状态含义：

- `managed`：已具备受管接管能力
- `inspect-only`：只识别本机状态，不猜测接管方式

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

### 3.5 MCP 管理

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

### 3.6 Web 控制台

- `/ui` 登录页与控制台壳
- Dashboard 基础页面
- Provider 表单增强
  - 常用 Provider 预设（OpenAI / Anthropic / DeepSeek / Moonshot / 智谱 / Qwen / SiliconFlow / OpenRouter）
  - 默认上游模型与模型映射编辑（`source = target` 行格式）
  - 按 ProviderType 的 Base URL / 凭据格式提示
  - Responses API 模式选择（Codex 链路）
- QuickStart 项目接入工作台（Provider 草稿支持默认上游模型）
- Runtime Governance / Service Doctor / Startup Recovery 跟进卡
- MCP 校验历史与治理跟进行动入口
- 中英双语基础设施

### 3.7 工作区自动发现

- 支持扫描本机项目目录生成 workspace 候选
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
