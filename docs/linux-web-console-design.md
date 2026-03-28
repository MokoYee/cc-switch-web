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
- 本次归档后，CLI 进入维护态；后续新增治理能力默认只在 Web 控制台交付，CLI 只保留 `daemon` / `daemon service` / `web` 等运行入口与兼容命令。

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

## 4. 当前与 cc-switch 的差距

如果按 `cc-switch` 常见产品模块来对比，当前状态可以分成三层。

### 4.1 已基本到位

- 供应商管理
- 代理与故障转移

说明：

- 数据模型、CRUD、持久化、运行时热重载已经具备基础产品形态。
- 与 `cc-switch` 的差距更多在控制台完整度、细节体验和更丰富的协议生态，而不是主链路缺失。

### 4.2 有基础闭环，但还没产品化完成

- MCP
- 用量追踪
- 配额治理

说明：

- MCP 已具备服务端数据模型、宿主机同步和导入导出闭环。
- 控制台编辑体验、字段级冲突预览、治理修复与校验历史已经补齐到可用形态。
- 仍未做的是更深的批量编辑、`openclaw` 适配和更完整的宿主机生态扩展。
- 当前协议桥接层已把非流式与流式 `usage` 数据接入持久化。
- 控制台、API 与 CLI 已具备用量明细、聚合统计、时间趋势查询能力。
- 已补齐“按应用日配额”最小闭环，并接入控制台状态联动、CLI 管理与 quota 审计事件。
- 成本追踪当前不在范围内，但“用量统计 + 配额治理”已进入可用雏形。

### 4.3 有最小闭环，但仍需产品化增强

- 会话管理器与工作区

说明：

- Workspace / Session 已补齐最小数据模型、SQLite 持久化、快照/导入导出、API、CLI 与控制台基础管理。
- 已新增“有效上下文解析”，可以看到工作区或会话最终落到哪个 Provider / Prompt / Skill，以及来源与缺失告警。
- 已新增“激活上下文 -> 真实运行策略”链路，激活的 Workspace / Session 已可影响代理默认 Provider 选路，并将 Prompt / Skill 以系统指令形式注入请求。
- 已提供 `GET /api/v1/active-context/effective/:appCode` 与 `ccsw active-context resolve <appCode>` 便于排查某个 CLI 当前真实生效的上下文。
- 上述解析接口已支持 `workspaceId/sessionId` 显式覆盖参数，可与代理请求头协议保持一致。
- 已补齐工作区候选整批归档、嵌套 session 根折叠与单活跃 session 自动归并，主链路的自动建档闭环已经成型。
- 当前还没有做的是宿主机工作区接管、更深的探测回填和更完整的团队协作能力。

## 5. 剩余重点功能清单

### 5.1 P0：MCP 管理与同步增强

目标：

- 在现有 MCP 基础闭环上继续补齐产品化能力
- 扩展更多宿主机 AI CLI 的 MCP 配置同步
- 增加导入、自发现、审计与控制台管理

当前已完成：

- MCP 控制台管理页与运行态治理
- 宿主机现有 MCP 配置导入与字段级差异预览
- Governance repair 单应用 / 整批预览与执行
- MCP 基线校验历史与控制台跟进视图

当前剩余：

- 更深的批量编辑、批量启停与跨应用治理编排
- 更多宿主机 AI CLI 的 MCP 能力矩阵扩展
- 更强的回归验证自动化与交付 runbook

### 5.2 P0：用量追踪

目标：

- 对请求级 usage 做真实持久化
- 支持按时间、应用、供应商、模型聚合
- 为后续配额、限流、报表提供基础

建议最小闭环：

- `usage_records` 表
- 非流式响应 usage 归一化入库
- Usage 查询 API
- Usage CLI 查询入口
- 控制台总览卡片、聚合列表与明细列表

当前剩余：

- 趋势图与时间维度可视化增强
- 更细的模型族归类
- 后续如需可再叠加成本估算，但当前不做

### 5.3 P0：配额治理

目标：

- 基于已落地的 usage 数据，提供最小可用的应用级治理能力
- 在代理入口做前置拦截，避免失控流量持续透传
- 让 CLI、API、控制台三端都具备一致的治理操作入口

当前已完成：

- `app_quotas` 持久化
- 日配额判断与代理前置 `429` 拦截
- `GET /api/v1/app-quotas/statuses`
- `ccsw quota list|set|delete`
- 控制台显示当前消耗、剩余额度、配额状态
- quota 拒绝事件进入统一审计流

当前剩余：

- 更细粒度的周期类型与模型级配额
- 配额命中后的更丰富降级策略
- 更完整的治理报表与批量操作体验

### 5.4 P1：Prompts 与 Skills

目标：

- 统一管理提示词模板与技能元数据
- 面向不同 AI CLI 的导出或同步能力预留接口
- 双语文案和公开仓库结构提前规范

当前已完成：

- Prompt 模板实体
- Skill 清单实体
- 标签、启用状态、应用作用域、语言维度
- 导入导出与快照恢复
- Prompt / Skill 版本化历史、差异预览与版本恢复
- Prompt / Skill 资产治理队列
- Prompt Host Sync 单应用与整批宿主机下发预览 / 执行
- Skill Delivery CLI / API / 控制台能力矩阵
- 保守型资产治理批量修复
  - 自动重新启用“仍被引用但已停用”的 Prompt
  - 自动重新启用“仍被工作区/会话引用但已停用”的 Skill
  - 自动重新启用被 Skill 依赖但已停用的 Prompt
  - 对缺失 Prompt 这类高风险场景只做告警，不做危险自动改写
- `ccsw assets governance preview|repair [--app <appCode>]`
- API / CLI / 控制台基础管理

当前剩余：

- 更完整的批量编辑与冲突比较
- Skill 宿主机原生文件投放与不同 CLI 的更深适配
- 更贴近工作流的执行/编排能力

### 5.5 P1：会话管理器与工作区

目标：

- 管理不同 CLI 的工作区绑定、会话入口、默认配置集
- 为后续“项目级切换”和“团队工作台”预留基础

当前已完成：

- Workspace 实体
- Workspace 与 Provider / Prompt / Skill 关联
- Session 元数据索引
- 工作区候选整批归档
- 嵌套 session `cwd` 自动折叠到最近项目根
- 单工作区单活跃 session 自动归并
- 工作区与会话有效上下文解析
- 激活上下文驱动的默认 Provider 选路
- 激活上下文驱动的 Prompt / Skill 系统指令注入
- QuickStart 项目接入工作台
  - 工作区候选归档
  - 一键建并激活会话
  - 陈旧会话清理
  - 跳转上下文资源面板
- Active Context 生效结果 API / CLI
- API / CLI / 控制台基础管理

当前剩余：

- 继续把宿主机 CLI 探测结果更深接入 workspace / session 自动建档与接管建议
- 工作区级版本快照与差异比较
- 团队级共享与更完整的操作审计

## 6. 当前不优先的内容

- 成本追踪与计费
- 容器优先部署编排
- 未经验证的第三方 CLI 强接管
- 重前端工作台化而轻代理主链路
- 继续扩展 CLI 治理面与命令覆盖率

## 7. 推荐的后续优先级

建议顺序：

1. 发布与运维交付文档收口
2. MCP 批量治理与宿主机生态扩展
3. 宿主机工作区接管与探测回填增强
4. 更完整的审计与团队协作治理

原因：

- 当前代码主链路已经基本闭合，最先缺的是 README、设计文档、Prometheus 抓取示例、告警模板这类对外可交付材料。
- MCP 仍然是 AI CLI 中台的生态核心，需要继续补宿主机覆盖面和批量治理。
- 宿主机探测结果与 workspace/session 模型还有继续打通的空间，适合在自动建档闭环稳定后继续加深。
- 审计与团队协作属于治理放大器，适合在运行链路稳定后继续扩展。
