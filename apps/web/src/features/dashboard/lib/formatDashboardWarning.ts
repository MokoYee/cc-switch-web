import type { LocaleCode } from "cc-switch-web-shared";

const translate = (locale: LocaleCode, zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

const joinList = (items: string[]): string => items.join(", ");

export const formatDashboardWarning = (
  warning: string,
  locale: LocaleCode
): string => {
  let match: RegExpMatchArray | null = null;

  if (warning === "App code is not configured") {
    return translate(locale, "尚未配置应用标识。", "App code is not configured.");
  }
  if (warning === "Provider is not configured") {
    return translate(locale, "尚未配置 Provider。", "Provider is not configured.");
  }

  match = warning.match(/^Provider not found: (.+)$/);
  if (match) {
    return translate(locale, `未找到 Provider：${match[1]}。`, `Provider not found: ${match[1]}.`);
  }

  match = warning.match(/^Prompt template not found: (.+)$/);
  if (match) {
    return translate(locale, `未找到 Prompt 模板：${match[1]}。`, `Prompt template not found: ${match[1]}.`);
  }

  match = warning.match(/^Skill not found: (.+)$/);
  if (match) {
    return translate(locale, `未找到 Skill：${match[1]}。`, `Skill not found: ${match[1]}.`);
  }

  match = warning.match(/^Workspace not found: (.+)$/);
  if (match) {
    return translate(locale, `未找到工作区：${match[1]}。`, `Workspace not found: ${match[1]}.`);
  }

  match = warning.match(/^Workspace does not exist: (.+)$/);
  if (match) {
    return translate(locale, `工作区不存在：${match[1]}。`, `Workspace does not exist: ${match[1]}.`);
  }

  match = warning.match(/^Provider does not exist: (.+)$/);
  if (match) {
    return translate(locale, `Provider 不存在：${match[1]}。`, `Provider does not exist: ${match[1]}.`);
  }

  match = warning.match(/^Referenced prompt template does not exist: (.+)$/);
  if (match) {
    return translate(
      locale,
      `关联的 Prompt 模板不存在：${match[1]}。`,
      `Referenced prompt template does not exist: ${match[1]}.`
    );
  }

  match = warning.match(/^Referenced by binding (.+)$/);
  if (match) {
    return translate(locale, `仍被应用绑定引用：${match[1]}。`, `Still referenced by binding ${match[1]}.`);
  }

  match = warning.match(/^Referenced by failover chain (.+)$/);
  if (match) {
    return translate(locale, `仍被故障转移链引用：${match[1]}。`, `Still referenced by failover chain ${match[1]}.`);
  }

  match = warning.match(/^Referenced by workspace (.+)$/);
  if (match) {
    return translate(locale, `仍被工作区引用：${match[1]}。`, `Still referenced by workspace ${match[1]}.`);
  }

  match = warning.match(/^Referenced by session (.+)$/);
  if (match) {
    return translate(locale, `仍被会话引用：${match[1]}。`, `Still referenced by session ${match[1]}.`);
  }

  match = warning.match(/^Referenced by MCP app binding (.+)$/);
  if (match) {
    return translate(locale, `仍被 MCP 应用绑定引用：${match[1]}。`, `Still referenced by MCP app binding ${match[1]}.`);
  }

  match = warning.match(/^Prompt template is disabled: (.+)$/);
  if (match) {
    return translate(locale, `Prompt 模板已停用：${match[1]}。`, `Prompt template is disabled: ${match[1]}.`);
  }

  match = warning.match(/^Skill is disabled: (.+)$/);
  if (match) {
    return translate(locale, `Skill 已停用：${match[1]}。`, `Skill is disabled: ${match[1]}.`);
  }

  match = warning.match(/^Enabled provider (.+) has no new credential input\. Existing credential fallback may be required\.$/);
  if (match) {
    return translate(
      locale,
      `Provider ${match[1]} 已启用，但当前没有新的凭证输入，可能会继续依赖已有凭证回退。`,
      `Provider ${match[1]} is enabled without a new credential input, so it may rely on an existing credential fallback.`
    );
  }

  match = warning.match(/^Disabling provider (.+) will impact bindings for: (.+)$/);
  if (match) {
    return translate(
      locale,
      `停用 Provider ${match[1]} 会影响这些应用绑定：${match[2]}。`,
      `Disabling provider ${match[1]} will impact these app bindings: ${match[2]}.`
    );
  }

  match = warning.match(/^Disabling provider (.+) will reduce failover coverage for: (.+)$/);
  if (match) {
    return translate(
      locale,
      `停用 Provider ${match[1]} 会削弱这些应用的故障转移覆盖：${match[2]}。`,
      `Disabling provider ${match[1]} will reduce failover coverage for: ${match[2]}.`
    );
  }

  match = warning.match(/^Binding target provider does not exist: (.+)$/);
  if (match) {
    return translate(locale, `绑定目标 Provider 不存在：${match[1]}。`, `Binding target provider does not exist: ${match[1]}.`);
  }

  match = warning.match(/^App (.+) already has another binding: (.+)$/);
  if (match) {
    return translate(
      locale,
      `应用 ${match[1]} 已存在其他绑定：${match[2]}。`,
      `App ${match[1]} already has another binding: ${match[2]}.`
    );
  }

  match = warning.match(/^Observe mode will keep routing passive while failover chain for (.+) remains enabled\.$/);
  if (match) {
    return translate(
      locale,
      `应用 ${match[1]} 当前仍启用故障转移链，观察模式不会真正接管路由。`,
      `Observe mode stays passive while the failover chain for ${match[1]} remains enabled.`
    );
  }

  match = warning.match(/^Duplicate providers were normalized in failover chain (.+)\.$/);
  if (match) {
    return translate(
      locale,
      `故障转移链 ${match[1]} 中的重复 Provider 已被自动归一化。`,
      `Duplicate providers were normalized in failover chain ${match[1]}.`
    );
  }

  match = warning.match(/^Failover provider does not exist: (.+)$/);
  if (match) {
    return translate(locale, `故障转移 Provider 不存在：${match[1]}。`, `Failover provider does not exist: ${match[1]}.`);
  }

  match = warning.match(/^App (.+) has no primary binding yet; failover chain has no primary entry point\.$/);
  if (match) {
    return translate(
      locale,
      `应用 ${match[1]} 还没有主绑定，故障转移链目前缺少主入口。`,
      `App ${match[1]} has no primary binding yet, so the failover chain has no primary entry point.`
    );
  }

  match = warning.match(/^Failover chain does not include bound primary provider (.+)\.$/);
  if (match) {
    return translate(
      locale,
      `故障转移链未包含当前主绑定 Provider：${match[1]}。`,
      `The failover chain does not include the bound primary provider ${match[1]}.`
    );
  }

  match = warning.match(/^Max attempts (\d+) exceeds available routing candidates (\d+)\.$/);
  if (match) {
    return translate(
      locale,
      `最大尝试次数 ${match[1]} 超过了可用路由候选数 ${match[2]}。`,
      `Max attempts ${match[1]} exceeds the available routing candidates ${match[2]}.`
    );
  }

  match = warning.match(/^No routable provider is available for app (.+) under the current binding\/failover plan\.$/);
  if (match) {
    return translate(
      locale,
      `在当前绑定与故障转移配置下，应用 ${match[1]} 没有可路由的 Provider。`,
      `No routable provider is available for app ${match[1]} under the current binding/failover plan.`
    );
  }

  match = warning.match(/^Default provider does not exist: (.+)$/);
  if (match) {
    return translate(locale, `默认 Provider 不存在：${match[1]}。`, `Default provider does not exist: ${match[1]}.`);
  }

  match = warning.match(/^Default prompt template does not exist: (.+)$/);
  if (match) {
    return translate(locale, `默认 Prompt 模板不存在：${match[1]}。`, `Default prompt template does not exist: ${match[1]}.`);
  }

  match = warning.match(/^Default skill does not exist: (.+)$/);
  if (match) {
    return translate(locale, `默认 Skill 不存在：${match[1]}。`, `Default skill does not exist: ${match[1]}.`);
  }

  match = warning.match(/^Disabling workspace (.+) may orphan (\d+) linked session\(s\)\.$/);
  if (match) {
    return translate(
      locale,
      `停用工作区 ${match[1]} 可能让 ${match[2]} 个关联会话失去归属。`,
      `Disabling workspace ${match[1]} may orphan ${match[2]} linked session(s).`
    );
  }

  match = warning.match(/^Quota (.+) is enabled but no request or token limit is configured\.$/);
  if (match) {
    return translate(
      locale,
      `配额 ${match[1]} 已启用，但没有配置请求上限或 Token 上限。`,
      `Quota ${match[1]} is enabled without a request or token limit.`
    );
  }

  match = warning.match(/^Disabling proxy policy will stop managed ingress for: (.+)$/);
  if (match) {
    return translate(
      locale,
      `停用代理策略会中断这些应用的托管入口：${match[1]}。`,
      `Disabling the proxy policy will stop managed ingress for: ${match[1]}.`
    );
  }

  match = warning.match(/^Proxy listen host is no longer loopback-only: (.+)$/);
  if (match) {
    return translate(
      locale,
      `代理监听地址已不再是仅本机回环：${match[1]}。`,
      `The proxy listen host is no longer loopback-only: ${match[1]}.`
    );
  }

  match = warning.match(/^MCP server not found for binding target: (.+)$/);
  if (match) {
    return translate(locale, `MCP 绑定目标服务器不存在：${match[1]}。`, `MCP server not found for binding target: ${match[1]}.`);
  }

  match = warning.match(/^App (.+) already has another binding for server (.+)$/);
  if (match) {
    return translate(
      locale,
      `应用 ${match[1]} 已经存在指向服务器 ${match[2]} 的其他绑定。`,
      `App ${match[1]} already has another binding for server ${match[2]}.`
    );
  }

  match = warning.match(/^Disabling MCP server (.+) will affect enabled bindings for: (.+)$/);
  if (match) {
    return translate(
      locale,
      `停用 MCP 服务器 ${match[1]} 会影响这些已启用绑定：${match[2]}。`,
      `Disabling MCP server ${match[1]} will affect enabled bindings for: ${match[2]}.`
    );
  }

  match = warning.match(/^MCP server (.+) is currently synced to host configs for: (.+)$/);
  if (match) {
    return translate(
      locale,
      `MCP 服务器 ${match[1]} 当前已经同步到这些宿主机配置：${match[2]}。`,
      `MCP server ${match[1]} is currently synced to host configs for: ${match[2]}.`
    );
  }

  match = warning.match(/^MCP server (.+) also exists in host import sources for: (.+)$/);
  if (match) {
    return translate(
      locale,
      `MCP 服务器 ${match[1]} 也存在于这些宿主机导入源中：${match[2]}。`,
      `MCP server ${match[1]} also exists in host import sources for: ${match[2]}.`
    );
  }

  match = warning.match(/^Host MCP config will be created: (.+)$/);
  if (match) {
    return translate(
      locale,
      `将创建宿主机 MCP 配置文件：${match[1]}。`,
      `The host MCP config will be created at: ${match[1]}.`
    );
  }

  match = warning.match(/^Managed MCP entries will be removed for (.+): (.+)$/);
  if (match) {
    return translate(
      locale,
      `${match[1]} 的这些托管 MCP 条目会被移除：${match[2]}。`,
      `These managed MCP entries will be removed for ${match[1]}: ${match[2]}.`
    );
  }

  match = warning.match(/^Imported proxy host is not loopback-only: (.+)$/);
  if (match) {
    return translate(
      locale,
      `导入的代理监听地址不是仅本机回环：${match[1]}。`,
      `The imported proxy host is not loopback-only: ${match[1]}.`
    );
  }

  if (warning === "Imported package contains no app bindings.") {
    return translate(locale, "导入包中不包含任何应用绑定。", "The imported package contains no app bindings.");
  }

  if (warning === "Restore will overwrite current persisted objects with the selected snapshot state.") {
    return translate(
      locale,
      "恢复操作会用所选快照状态覆盖当前已持久化对象。",
      "Restore will overwrite the current persisted objects with the selected snapshot state."
    );
  }

  if (warning === "Restore includes routing binding changes.") {
    return translate(locale, "恢复内容包含路由绑定变更。", "Restore includes routing binding changes.");
  }

  return warning;
};

export const joinDashboardWarnings = (
  warnings: string[],
  locale: LocaleCode,
  emptyLabel: string
): string =>
  warnings.length === 0
    ? emptyLabel
    : joinList(warnings.map((warning) => formatDashboardWarning(warning, locale)));
