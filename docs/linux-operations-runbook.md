# CC Switch Web Linux 运行与回滚手册

## 1. 适用范围

本手册面向已经采用 `ccsw daemon` 作为主运行形态的 Linux 宿主机。
目标不是解释产品功能，而是给出一份可以直接交付给运维或自托管用户的最小 runbook：

- 怎么部署
- 怎么验证
- Prometheus 怎么抓
- 首批告警怎么配
- 出问题时怎么回滚

当前默认前提：

- daemon 监听 `127.0.0.1:8787`
- 控制台入口为 `/ui/`
- Prometheus 指标入口为 `/metrics`
- `/metrics` 当前不走控制台登录态，必须依赖本机监听边界或反向代理 ACL 额外保护

## 2. 推荐运行模型

推荐顺序：

1. 开发或临时排障时使用前台模式：`ccsw daemon start`
2. 面向长期运行时使用 `systemd --user`：`ccsw daemon service install`
3. `ccsw web` 只保留为调试/旁路控制台，不作为主交付形态

说明：

- 前台模式更适合临时接管、协议排障、宿主机预检
- 持久模式更适合长期代理、Prometheus 抓取和稳定交付
- 当前 `foreground-session` 宿主机接管在 daemon 正常退出时会自动回滚；如果上次异常退出，daemon 下次启动会自动恢复残留的临时接管
- 当前已提供 `ccsw daemon service logs` / `follow`，排障时优先使用统一 CLI 入口而不是手工拼 `journalctl`

## 3. 标准部署步骤

### 3.1 首次部署

```bash
npm install
npm run build
ccsw daemon service install
ccsw daemon service status
ccsw auth print-token
```

如果当前机器还不适合直接进入 `systemd --user` 模式，可以先用：

```bash
ccsw daemon start
```

### 3.2 最小验收

部署后至少确认这四项：

1. `http://127.0.0.1:8787/health` 返回 `status: ok`
2. `http://127.0.0.1:8787/ui/` 可登录并打开控制台
3. `http://127.0.0.1:8787/metrics` 能返回 Prometheus 文本格式
4. 运行治理面中的 `Service Doctor` 没有出现 `envInSync=false` 或明显 runtime drift

如果当前机器要承载真实 AI CLI，再补两项：

5. `npm run acceptance:cli:matrix -- --app codex` 或 `--app claude-code` 能生成当前验收步骤
6. 任选一种接管模式完成一次 `preview -> apply -> rollback` 闭环

### 3.3 上线后首轮人工核查

- 打开控制台 `Runtime Governance` 面板
- 看 `Service Doctor` 是否显示 `systemd --user available`
- 看 `runtimeMatch` 是否已经对齐
- 如果出现“启动自动恢复”卡片，先打开宿主机审计确认上次异常退出残留已经被清理
- 如果宿主机 CLI 处于临时接管模式，发起一次真实 CLI 请求，确认当前请求已经命中代理链路
- 如果 Provider 状态显示 `recovering`，继续观察恢复验证计数，不要把单次成功当成完全恢复

## 3.4 宿主机接管模式选择

推荐顺序：

1. 先用 `environment-override` 做低风险试接管
2. 验证稳定后，再决定是否切到 `file-rewrite`
3. 长期运行场景优先配合 `systemd --user`

最小命令：

```bash
ccsw host preview codex --mode environment-override
ccsw host apply codex --mode environment-override
ccsw host rollback codex
```

说明：

- `environment-override` 会生成受管导出脚本，并返回激活 / 清理命令
- 该模式不会自动改写 shell rc 文件
- 如果当前 shell 已经残留旧变量，先执行 apply 返回的清理命令，再重新激活
- `gemini-cli` 当前不在 takeover 可交付范围内，原因是代理主链路尚未提供 Gemini API / Gateway 适配

## 3.5 服务日志与诊断闭环

常用命令：

```bash
ccsw daemon service doctor
ccsw daemon service logs --lines 200
ccsw daemon service follow --lines 100
ccsw daemon service logs --since "today" --grep "error|warn"
```

推荐顺序：

1. 先执行 `ccsw daemon service doctor`，确认是 `systemd` 不可用、env 漂移还是 runtime drift
2. 如果服务未启动或刚重启失败，执行 `ccsw daemon service logs --lines 200`
3. 如果要边操作边观察，执行 `ccsw daemon service follow --lines 100`
4. 日志确认问题后，再回到 `sync-env`、`restart`、`rollback` 等动作

补充说明：

- `--since` / `--until` 直接透传给 `journalctl`，适合按时间窗口缩小范围
- `--grep` 适合快速聚焦 `error`、`warn`、`EADDRINUSE`、`SQLITE_BUSY` 等关键词
- `follow` 同样支持 `--grep`，适合边重启边观察关键错误

## 4. Prometheus 抓取示例

仓库内可直接复用的示例文件：

- `docs/examples/prometheus/scrape.yml`
- `docs/examples/prometheus/alerts.yml`

### 4.1 同机 Prometheus

适用于 Prometheus 与 daemon 部署在同一台 Linux 主机。

```yaml
scrape_configs:
  - job_name: ccsw
    scrape_interval: 15s
    static_configs:
      - targets:
          - 127.0.0.1:8787
    metrics_path: /metrics
```

### 4.2 经过反向代理或内网入口抓取

如果需要跨主机抓取，建议先在反向代理层补 ACL、来源限制或内网访问边界，再暴露 `/metrics`。

```yaml
scrape_configs:
  - job_name: ccsw-prod
    scrape_interval: 15s
    scheme: https
    metrics_path: /metrics
    static_configs:
      - targets:
          - cc-switch-web.internal.example.com
```

抓取前确认：

- Prometheus 实际访问的是 daemon 或反向代理的真实地址，而不是前端开发端口
- `/metrics` 所在入口已经被可信网络边界保护
- Prometheus 采集目标与 daemon 当前监听地址一致

## 5. 首批告警建议

当前 `/metrics` 以 gauge 为主，适合先配“运行态异常、Provider 健康、MCP 漂移、配额越界、快照缺失”五类告警。

可直接从仓库示例起步：

- `docs/examples/prometheus/alerts.yml`

```yaml
groups:
  - name: ccsw.rules
    rules:
      - alert: CCSWProxyRuntimeNotRunning
        expr: ccsw_proxy_runtime_state < 2
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "CC Switch Web proxy runtime is not running"
          description: "Proxy runtime state stayed below running=2 for more than 5 minutes."

      - alert: CCSWProviderDiagnosisDegraded
        expr: ccsw_provider_diagnosis_total{status=~"down|degraded|recovering"} > 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "CC Switch Web has degraded providers"
          description: "At least one provider remains in down/degraded/recovering state."

      - alert: CCSWMcpHostDriftDetected
        expr: ccsw_mcp_host_drift_total > 0
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "CC Switch Web MCP host drift detected"
          description: "Managed MCP host state differs from current enabled configuration."

      - alert: CCSWAppQuotaExceeded
        expr: ccsw_app_quota_status_total{state="exceeded"} > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "CC Switch Web app quota exceeded"
          description: "At least one app is already in exceeded quota state."

      - alert: CCSWNoSnapshotAvailable
        expr: ccsw_latest_snapshot_version == 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "CC Switch Web has no usable snapshot"
          description: "No persisted configuration snapshot is currently available."
```

建议告警接入后再按你的环境细化：

- 单独拆出 `down` 与 `degraded` 的不同告警级别
- 对 `ccsw_provider_requests_total` 增加 provider 维度观察图，而不是直接报警
- 如果生产环境长期使用 MCP Host Sync，可以把 `CCSWMcpHostDriftDetected` 提升到更高优先级

## 6. 回滚手册

### 6.1 配置快照回滚

优先使用控制台 `Recovery` 面板：

1. 查看最近快照与 diff
2. 先做 restore preview
3. 再执行目标版本恢复

如果需要走 API：

```bash
POST /api/v1/snapshots/:version/restore
POST /api/v1/snapshots/latest/restore
```

适用场景：

- Provider / Binding / MCP / Quota / Proxy Policy 变更后需要快速恢复
- 控制台看到 `latestSnapshotDiff` 明显偏离预期

### 6.2 宿主机接管回滚

如果是单应用宿主机接管问题，优先走控制台 Host Discovery / MCP Host Sync 的回滚动作。

常用 API：

```bash
POST /api/v1/host-discovery/:appCode/rollback
POST /api/v1/host-discovery/rollback-foreground
```

说明：

- `rollback-foreground` 适合清理临时前台接管
- 如果上次异常退出没来得及回滚，daemon 下次启动会自动做前台临时接管恢复

### 6.3 版本回滚

如果问题不是配置漂移，而是代码版本本身需要回退，建议按这个顺序：

1. 停服务：`systemctl --user stop cc-switch-web.service`
2. 切回上一版已知可用 commit/tag
3. 重新构建：`npm install && npm run build`
4. 重装或刷新服务环境：`ccsw daemon service install`
5. 启服务：`systemctl --user start cc-switch-web.service`
6. 重新验收 `/health`、`/ui/`、`/metrics` 和 `Service Doctor`

如果当前不是 `systemd --user` 模式，而是手工前台运行，则把第 1/5 步替换成停止当前前台进程并重新执行 `ccsw daemon start`。

## 7. 发布前最小检查清单

- `ccsw daemon service status` 正常
- `/health` 正常
- `/metrics` 可抓取
- 控制台可以登录
- `Service Doctor` 没有明显 env/runtime drift
- 真实 CLI 请求能打进代理日志
- `acceptance:cli:matrix` 已按目标 CLI 至少执行一轮
- 最近快照可见且 restore preview 正常
- 如启用了宿主机接管，确认 apply/rollback 各走通一次
