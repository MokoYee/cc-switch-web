# CC Switch Web CLI 兼容性验收矩阵

## 1. 目的

本文件用于把真实 CLI 接入验证从“零散 smoke / 单测”收口为一套可重复执行的验收矩阵。

目标不是一次性覆盖所有厂商，而是先把 `v0.2` 重点对象的真实接入、故障转移和恢复行为跑通。

## 2. 当前范围

| App | 当前状态 | 可验收接管模式 | 备注 |
| --- | --- | --- | --- |
| `codex` | Ready | `file-rewrite` / `environment-override` | env 模式依赖 Codex 内置 OpenAI provider；如果本地手工固定了 `model_provider`，先清理再验收。 |
| `claude-code` | Ready | `file-rewrite` / `environment-override` | file 模式还要同时验证 Claude onboarding bypass。 |
| `gemini-cli` | Blocked | 无 | 当前代理主链路尚未提供 Gemini API / Gateway 协议适配，因此本轮不执行 takeover apply。 |

## 3. 验收维度

统一覆盖以下 8 类场景：

- 非流式文本请求
- 流式文本请求
- 工具调用
- 图片输入
- 上游 429
- 上游 5xx
- 上游超时
- failover 后恢复

其中：

- `Ready` 状态的 CLI 必须至少完成一轮真实请求闭环。
- `Blocked` 状态的 CLI 必须明确记录阻塞原因，不允许伪造“支持已完成”。

## 4. 推荐执行方式

### 4.1 生成检查清单

```bash
npm run acceptance:cli:matrix
```

按 app 或场景过滤：

```bash
npm run acceptance:cli:matrix -- --app codex
npm run acceptance:cli:matrix -- --app claude-code --scenario failover-recovery
```

输出 JSON：

```bash
npm run acceptance:cli:matrix -- --format json
```

### 4.2 最小执行顺序

对 `codex` / `claude-code` 推荐按下面顺序执行：

1. `ccsw host scan`
2. `ccsw host preview <appCode> --mode file-rewrite`
3. `ccsw host apply <appCode> --mode file-rewrite`
4. 发起一条真实 CLI 请求
5. `ccsw logs requests --app <appCode> --limit 20`
6. `ccsw health probe <providerId>`
7. 切换到 `environment-override` 重复同一轮验证

对 `environment-override` 模式，必须额外确认：

- `apply` 返回的激活命令已经在启动目标 CLI 的 shell 中执行。
- 验证结束后执行 `unset ...` 或重开 shell，避免环境变量残留。

## 5. 通过标准

一次 CLI 验收至少要同时满足：

- 宿主机接管状态、Provider 运行态、最近请求日志三条链路一致。
- 主 Provider 失效时，不会持续击穿同一节点。
- 恢复后不会因为一次偶发成功就立即判定全量恢复。
- 控制台能够解释“为什么切换”“为什么仍未恢复”。

## 6. 结果记录模板

建议每轮验收至少记录以下字段：

```text
日期:
执行人:
CLI:
接管模式:
Provider 主链路:
Failover 链:
场景:
结果:
阻塞点:
日志 / 截图 / 请求记录:
后续动作:
```

## 7. 当前已知阻塞

- `gemini-cli`：当前仓库代理主链路没有 Gemini API / Gateway 适配，不能直接承诺 env takeover/file takeover 可用。
- `environment-override`：这是“显式 source 托管脚本”的安全方案，不会自动改用户 shell rc 文件。

