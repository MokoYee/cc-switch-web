import type {
  AppBinding,
  AppMcpBinding,
  AppQuota,
  FailoverChain,
  PromptTemplate,
  Provider,
  SessionRecord,
  Skill,
  Workspace
} from "cc-switch-web-shared";

export type DashboardFollowUpAction =
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "provider-runtime" | "provider-logs";
      readonly providerId: string;
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "workspace-runtime" | "workspace-logs";
      readonly workspaceId: string;
      readonly appCode?: AppBinding["appCode"];
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "session-runtime" | "session-logs";
      readonly sessionId: string;
      readonly appCode?: AppBinding["appCode"];
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "app-logs";
      readonly appCode: AppBinding["appCode"];
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "audit";
      readonly filters: {
        readonly source?: "host-integration" | "provider-health" | "proxy-request" | "mcp" | "quota";
        readonly appCode?: AppBinding["appCode"];
        readonly providerId?: string;
        readonly level?: "info" | "warn" | "error";
      };
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly kind: "section";
      readonly section: "routing" | "assets" | "mcp" | "runtime" | "traffic" | "recovery";
    };

export type DashboardFollowUpNotice = {
  readonly category:
    | "provider"
    | "workspace"
    | "session"
    | "asset"
    | "app-traffic"
    | "mcp"
    | "recovery"
    | "delete";
  readonly title: string;
  readonly summary: string;
  readonly actions: readonly DashboardFollowUpAction[];
};

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

export const buildWorkspaceSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: Workspace
): DashboardFollowUpNotice => ({
  category: "workspace",
  title: localize(locale, "工作区已保存", "Workspace Saved"),
  summary: localize(
    locale,
    "下一步应验证工作区运行态和相关请求是否恢复到预期上下文。",
    "Next, validate workspace runtime and related requests to confirm the expected context has been restored."
  ),
  actions: [
    {
      id: "workspace-follow-runtime",
      label: localize(locale, "打开工作区运行态", "Open Workspace Runtime"),
      kind: "workspace-runtime",
      workspaceId: item.id,
      ...(item.appCode ? { appCode: item.appCode } : {})
    },
    {
      id: "workspace-follow-logs",
      label: localize(locale, "查看工作区请求", "Open Workspace Logs"),
      kind: "workspace-logs",
      workspaceId: item.id,
      ...(item.appCode ? { appCode: item.appCode } : {})
    },
    {
      id: "workspace-follow-assets",
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    }
  ]
});

export const buildSessionSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: SessionRecord
): DashboardFollowUpNotice => ({
  category: "session",
  title: localize(locale, "会话已保存", "Session Saved"),
  summary: localize(
    locale,
    "下一步应确认会话是否重新命中了正确工作区、Provider 和上下文资产。",
    "Next, confirm the session is again resolving to the correct workspace, provider, and context assets."
  ),
  actions: [
    {
      id: "session-follow-runtime",
      label: localize(locale, "打开会话运行态", "Open Session Runtime"),
      kind: "session-runtime",
      sessionId: item.id,
      appCode: item.appCode
    },
    {
      id: "session-follow-logs",
      label: localize(locale, "查看会话请求", "Open Session Logs"),
      kind: "session-logs",
      sessionId: item.id,
      appCode: item.appCode
    },
    {
      id: "session-follow-assets",
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    }
  ]
});

export const buildPromptSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: PromptTemplate
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "Prompt 已保存", "Prompt Saved"),
  summary: localize(
    locale,
    "下一步应验证引用它的技能和对应应用流量是否仍命中正确 Prompt。",
    "Next, validate that referencing skills and app traffic still resolve to the correct prompt."
  ),
  actions: [
    ...(item.appCode
      ? [
          {
            id: "prompt-follow-logs",
            label: localize(locale, "查看该应用请求", "Open App Logs"),
            kind: "app-logs" as const,
            appCode: item.appCode
          }
        ]
      : []),
    {
      id: "prompt-follow-assets",
      label: localize(locale, "检查 Prompt / Skill 资产", "Review Prompt / Skill Assets"),
      kind: "section",
      section: "assets"
    }
  ]
});

export const buildPromptGovernanceAppliedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: PromptTemplate
): DashboardFollowUpNotice => ({
  category: "asset",
  title: localize(locale, "Prompt 治理动作已执行", "Prompt Governance Action Applied"),
  summary: localize(
    locale,
    "共享 Prompt 已按治理动作更新，下一步应确认关联 Skill、工作区和真实请求是否一起收敛。",
    "The shared prompt has been updated through a governance action. Next, confirm linked skills, workspaces, and live requests converge together."
  ),
  actions: [
    ...(item.appCode
      ? [
          {
            id: `prompt-governance-logs-${item.id}`,
            label: localize(locale, "查看该应用请求", "Open App Logs"),
            kind: "app-logs" as const,
            appCode: item.appCode
          }
        ]
      : []),
    {
      id: `prompt-governance-assets-${item.id}`,
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    }
  ]
});

export const buildPromptRestoredFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: PromptTemplate
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "Prompt 版本已恢复", "Prompt Version Restored"),
  summary: localize(
    locale,
    "下一步应确认引用该 Prompt 链路的技能、工作区和请求流量是否已经重新收敛。",
    "Next, confirm skills, workspaces, and request traffic that rely on this prompt chain have converged again."
  ),
  actions: [
    ...(item.appCode
      ? [
          {
            id: "prompt-restore-follow-logs",
            label: localize(locale, "查看该应用请求", "Open App Logs"),
            kind: "app-logs" as const,
            appCode: item.appCode
          }
        ]
      : []),
    {
      id: "prompt-restore-follow-assets",
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    }
  ]
});

export const buildSkillSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: Skill
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "Skill 已保存", "Skill Saved"),
  summary: localize(
    locale,
    "下一步应验证工作区、会话和目标应用流量是否仍解析到正确 Skill。",
    "Next, validate that workspaces, sessions, and target app traffic still resolve to the correct skill."
  ),
  actions: [
    ...(item.appCode
      ? [
          {
            id: "skill-follow-logs",
            label: localize(locale, "查看该应用请求", "Open App Logs"),
            kind: "app-logs" as const,
            appCode: item.appCode
          }
        ]
      : []),
    {
      id: "skill-follow-assets",
      label: localize(locale, "检查 Skill 资产", "Review Skill Assets"),
      kind: "section",
      section: "assets"
    }
  ]
});

export const buildSkillGovernanceAppliedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: Skill
): DashboardFollowUpNotice => ({
  category: "asset",
  title: localize(locale, "Skill 治理动作已执行", "Skill Governance Action Applied"),
  summary: localize(
    locale,
    "Skill 已按治理动作更新，下一步应确认工作区、会话和目标应用流量是否重新解析到正确链路。",
    "The skill has been updated through a governance action. Next, confirm workspaces, sessions, and target app traffic resolve back to the right chain."
  ),
  actions: [
    ...(item.appCode
      ? [
          {
            id: `skill-governance-logs-${item.id}`,
            label: localize(locale, "查看该应用请求", "Open App Logs"),
            kind: "app-logs" as const,
            appCode: item.appCode
          }
        ]
      : []),
    {
      id: `skill-governance-assets-${item.id}`,
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    }
  ]
});

export const buildSkillRestoredFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: Skill
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "Skill 版本已恢复", "Skill Version Restored"),
  summary: localize(
    locale,
    "下一步应确认工作区、会话和目标应用流量是否重新解析到恢复后的 Skill。",
    "Next, confirm workspaces, sessions, and target app traffic resolve to the restored skill again."
  ),
  actions: [
    ...(item.appCode
      ? [
          {
            id: "skill-restore-follow-logs",
            label: localize(locale, "查看该应用请求", "Open App Logs"),
            kind: "app-logs" as const,
            appCode: item.appCode
          }
        ]
      : []),
    {
      id: "skill-restore-follow-assets",
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    }
  ]
});

export const buildMcpServerSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US"
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "MCP Server 已保存", "MCP Server Saved"),
  summary: localize(
    locale,
    "下一步应验证 MCP 运行态、宿主机差异和相关审计事件是否一致。",
    "Next, validate MCP runtime, host drift preview, and related audit events for consistency."
  ),
  actions: [
    {
      id: "mcp-server-follow-section",
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: "mcp-server-follow-audit",
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp"
      }
    }
  ]
});

export const buildMcpBindingSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: AppMcpBinding
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "MCP Binding 已保存", "MCP Binding Saved"),
  summary: localize(
    locale,
    "下一步应验证该应用的 MCP 运行态和宿主机同步结果。",
    "Next, validate MCP runtime and host sync result for this app."
  ),
  actions: [
    {
      id: "mcp-binding-follow-section",
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: "mcp-binding-follow-audit",
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp",
        appCode: item.appCode
      }
    }
  ]
});

export const buildProviderSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: Provider
): DashboardFollowUpNotice => ({
  category: "provider",
  title: localize(locale, "Provider 已保存", "Provider Saved"),
  summary: localize(
    locale,
    "下一步应验证 Provider 运行态、失败请求和健康事件是否同步恢复。",
    "Next, validate provider runtime, failure requests, and health events to confirm recovery."
  ),
  actions: [
    {
      id: "provider-follow-runtime",
      label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
      kind: "provider-runtime",
      providerId: item.id
    },
    {
      id: "provider-follow-logs",
      label: localize(locale, "查看失败请求", "Open Failure Logs"),
      kind: "provider-logs",
      providerId: item.id
    },
    {
      id: "provider-follow-audit",
      label: localize(locale, "查看健康审计", "Open Health Audit"),
      kind: "audit",
      filters: {
        source: "provider-health",
        providerId: item.id
      }
    }
  ]
});

export const buildBindingSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: AppBinding
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "Binding 已保存", "Binding Saved"),
  summary: localize(
    locale,
    "下一步应回到接管闭环验证，确认目标应用流量已经命中新主路由、上下文对象和本地代理。",
    "Next, return to the takeover verification loop and confirm target app traffic is hitting the new primary route, context objects, and local proxy."
  ),
  actions: [
    {
      id: "binding-follow-logs",
      label: localize(locale, "查看流量验证", "Open Traffic Verification"),
      kind: "app-logs",
      appCode: item.appCode
    },
    {
      id: "binding-follow-runtime",
      label: localize(locale, "打开运行时", "Open Runtime"),
      kind: "section",
      section: "runtime"
    },
    {
      id: "binding-follow-routing",
      label: localize(locale, "返回路由面板", "Back To Routing"),
      kind: "section",
      section: "routing"
    }
  ]
});

export const buildQuotaSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: AppQuota
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "配额已保存", "Quota Saved"),
  summary: localize(
    locale,
    "下一步应验证配额审计和目标应用流量是否已经回到健康窗口。",
    "Next, validate quota audit and target app traffic to confirm the window has returned to a healthy state."
  ),
  actions: [
    {
      id: "quota-follow-audit",
      label: localize(locale, "查看配额审计", "Open Quota Audit"),
      kind: "audit",
      filters: {
        source: "quota",
        appCode: item.appCode
      }
    },
    {
      id: "quota-follow-logs",
      label: localize(locale, "查看该应用请求", "Open App Logs"),
      kind: "app-logs",
      appCode: item.appCode
    }
  ]
});

export const buildProxyPolicySavedFollowUpNotice = (
  locale: "zh-CN" | "en-US"
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "代理策略已保存", "Proxy Policy Saved"),
  summary: localize(
    locale,
    "下一步应验证流量面板和恢复面板，确认新的代理策略正在按预期生效。",
    "Next, validate the traffic and recovery panels to confirm the new proxy policy is taking effect as expected."
  ),
  actions: [
    {
      id: "proxy-follow-traffic",
      label: localize(locale, "打开流量面板", "Open Traffic Panel"),
      kind: "section",
      section: "traffic"
    },
    {
      id: "proxy-follow-recovery",
      label: localize(locale, "打开恢复面板", "Open Recovery"),
      kind: "section",
      section: "recovery"
    }
  ]
});

export const buildFailoverSavedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  item: FailoverChain
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "故障转移链已保存", "Failover Chain Saved"),
  summary: localize(
    locale,
    "下一步应回到接管闭环验证，确认目标应用请求、Provider 运行态和故障转移链正在一起兜底。",
    "Next, return to the takeover verification loop and confirm target app requests, provider runtime, and failover behavior are protecting traffic together."
  ),
  actions: [
    {
      id: "failover-follow-logs",
      label: localize(locale, "查看流量验证", "Open Traffic Verification"),
      kind: "app-logs",
      appCode: item.appCode
    },
    {
      id: "failover-follow-recovery",
      label: localize(locale, "打开恢复面板", "Open Recovery"),
      kind: "section",
      section: "recovery"
    },
    {
      id: "failover-follow-routing",
      label: localize(locale, "返回路由面板", "Back To Routing"),
      kind: "section",
      section: "routing"
    }
  ]
});

export const buildSessionDiscoveryFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly activate: boolean;
    readonly createdWorkspace: boolean;
    readonly session: Pick<SessionRecord, "id" | "appCode">;
    readonly workspace: Pick<Workspace, "id" | "appCode">;
  }
): DashboardFollowUpNotice => ({
  category: "session",
  title: input.activate
    ? localize(locale, "会话已建档并激活", "Session Created And Activated")
    : localize(locale, "会话已自动建档", "Session Auto-Created"),
  summary: input.activate
    ? localize(
        locale,
        "该项目已经切到当前激活上下文，下一步应确认运行态和真实请求是否已经命中这条链路。",
        "This project has been switched into the active context. Next, confirm runtime and live traffic are hitting this path."
      )
    : input.createdWorkspace
      ? localize(
          locale,
          "已自动补齐工作区和会话建档，下一步应确认运行态是否命中正确上下文。",
          "Workspace and session records were created automatically. Next, confirm runtime is resolving to the right context."
        )
      : localize(
          locale,
          "已基于现有工作区补齐会话建档，下一步应确认运行态是否已经挂到正确对象。",
          "A session record was created from the existing workspace. Next, confirm runtime is attached to the right object."
        ),
  actions: [
    {
      id: `session-ensure-runtime-${input.session.id}`,
      label: localize(locale, "查看会话运行态", "Open Session Runtime"),
      kind: "session-runtime",
      sessionId: input.session.id,
      appCode: input.session.appCode
    },
    {
      id: `session-ensure-workspace-${input.workspace.id}`,
      label: localize(locale, "查看工作区运行态", "Open Workspace Runtime"),
      kind: "workspace-runtime",
      workspaceId: input.workspace.id,
      ...(input.workspace.appCode ? { appCode: input.workspace.appCode } : {})
    },
    {
      id: `session-ensure-logs-${input.session.id}`,
      label: localize(locale, "查看应用请求", "Open App Requests"),
      kind: "app-logs",
      appCode: input.session.appCode
    }
  ]
});

export const buildProjectIntakeStableFollowUpNotice = (
  locale: "zh-CN" | "en-US"
): DashboardFollowUpNotice => ({
  category: "workspace",
  title: localize(locale, "项目接入队列已稳定", "Project Intake Queue Stable"),
  summary: localize(
    locale,
    "当前没有需要自动收敛的项目接入动作，可以继续做 Prompt / MCP / 流量治理。",
    "There is no project intake action to auto-close right now. You can keep focusing on prompt, MCP, and traffic governance."
  ),
  actions: [
    {
      id: "project-intake-stable-assets",
      label: localize(locale, "返回上下文资源", "Back To Context Resources"),
      kind: "section",
      section: "assets"
    },
    {
      id: "project-intake-stable-runtime",
      label: localize(locale, "查看运行态", "Open Runtime"),
      kind: "section",
      section: "runtime"
    }
  ]
});

export const buildProjectIntakeConvergedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly category: "workspace" | "session";
    readonly summary: string;
    readonly actions: readonly DashboardFollowUpAction[];
  }
): DashboardFollowUpNotice => ({
  category: input.category,
  title: localize(locale, "项目接入收敛已执行", "Project Intake Converged"),
  summary: input.summary,
  actions: input.actions
});

export const buildDeleteCompletedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  kind:
    | "provider"
    | "binding"
    | "app-quota"
    | "failover-chain"
    | "prompt-template"
    | "skill"
    | "workspace"
    | "session"
    | "mcp-server"
    | "mcp-app-binding"
): DashboardFollowUpNotice => {
  const section =
    kind === "provider" || kind === "binding" || kind === "app-quota" || kind === "failover-chain"
      ? "routing"
      : kind === "mcp-server" || kind === "mcp-app-binding"
        ? "mcp"
        : "assets";

  return {
    category: "delete",
    title: localize(locale, "删除已执行", "Delete Completed"),
    summary: localize(
      locale,
      "下一步应回到对应治理面板，确认引用链和运行态是否已经收敛。",
      "Next, return to the relevant governance panel and confirm references and runtime state have converged."
    ),
    actions: [
      {
        id: `delete-follow-${kind}`,
        label:
          section === "routing"
            ? localize(locale, "返回路由面板", "Back To Routing")
            : section === "mcp"
              ? localize(locale, "返回 MCP 面板", "Back To MCP")
              : localize(locale, "返回上下文资产", "Back To Context Assets"),
        kind: "section",
        section
      },
      {
        id: `delete-follow-recovery-${kind}`,
        label: localize(locale, "查看恢复面板", "Open Recovery"),
        kind: "section",
        section: "recovery"
      }
    ]
  };
};

export const buildArchiveStaleSessionsFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  archivedSessionCount: number
): DashboardFollowUpNotice => ({
  category: "session",
  title: localize(locale, "陈旧会话已归档", "Stale Sessions Archived"),
  summary:
    archivedSessionCount > 0
      ? localize(
          locale,
          `已归档 ${archivedSessionCount} 个陈旧会话。下一步应确认当前激活上下文和项目接入候选是否已经收敛。`,
          `${archivedSessionCount} stale session(s) were archived. Next, confirm the active context and project intake candidates are now converged.`
        )
      : localize(
          locale,
          "当前没有新的陈旧会话需要归档，可以继续处理工作区候选和运行态验证。",
          "There are no new stale sessions to archive right now, so you can continue with workspace candidates and runtime verification."
        ),
  actions: [
    {
      id: "archive-stale-assets",
      label: localize(locale, "返回上下文资源", "Back To Context Resources"),
      kind: "section",
      section: "assets"
    },
    {
      id: "archive-stale-runtime",
      label: localize(locale, "查看运行态", "Open Runtime"),
      kind: "section",
      section: "runtime"
    }
  ]
});

export const buildWorkspaceDiscoveryImportedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly item: Pick<Workspace, "id" | "appCode">;
    readonly linkedSessionCount: number;
    readonly firstLinkedSessionId?: string;
  }
): DashboardFollowUpNotice => ({
  category: "workspace",
  title: localize(locale, "工作区候选已归档", "Workspace Candidate Imported"),
  summary:
    input.linkedSessionCount > 0
      ? localize(
          locale,
          `已自动挂回 ${input.linkedSessionCount} 个历史会话，下一步应确认工作区运行态是否已收敛。`,
          `Automatically linked ${input.linkedSessionCount} historical sessions. Next, confirm the workspace runtime has converged.`
        )
      : localize(
          locale,
          "工作区已建档，下一步应确认默认上下文配置和运行态是否正确。",
          "The workspace is now recorded. Next, confirm the default context and runtime are correct."
        ),
  actions: [
    {
      id: `workspace-import-runtime-${input.item.id}`,
      label: localize(locale, "查看工作区运行态", "Open Workspace Runtime"),
      kind: "workspace-runtime",
      workspaceId: input.item.id,
      ...(input.item.appCode ? { appCode: input.item.appCode } : {})
    },
    ...(input.firstLinkedSessionId
      ? [
          {
            id: `workspace-import-session-${input.firstLinkedSessionId}`,
            label: localize(locale, "查看关联会话", "Open Linked Session"),
            kind: "session-runtime" as const,
            sessionId: input.firstLinkedSessionId,
            ...(input.item.appCode ? { appCode: input.item.appCode } : {})
          }
        ]
      : [])
  ]
});

export const buildWorkspaceDiscoveryBatchImportedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly importedCount: number;
    readonly linkedSessionCount: number;
  }
): DashboardFollowUpNotice => ({
  category: "workspace",
  title: localize(locale, "工作区候选已整批归档", "Workspace Candidates Imported"),
  summary:
    input.importedCount === 0
      ? localize(
          locale,
          "当前没有新的工作区候选需要归档，发现列表与工作区档案已经基本一致。",
          "There are no new workspace candidates to import right now. Discovery and workspace inventory are already aligned."
        )
      : localize(
          locale,
          `已归档 ${input.importedCount} 个候选，并自动挂回 ${input.linkedSessionCount} 个历史会话。下一步应检查上下文运行态是否已经收敛。`,
          `Imported ${input.importedCount} candidate(s) and linked ${input.linkedSessionCount} historical session(s). Next, confirm context runtime has converged.`
        ),
  actions: [
    {
      id: "workspace-discovery-batch-assets",
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    },
    {
      id: "workspace-discovery-batch-runtime",
      label: localize(locale, "查看运行态", "Open Runtime"),
      kind: "section",
      section: "runtime"
    }
  ]
});

export const buildBatchMcpGovernanceAppliedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly repairedAppCount: number;
    readonly hostSyncRequiredAppCount: number;
  }
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "整批 MCP 治理已执行", "Batch MCP Governance Applied"),
  summary:
    input.repairedAppCount === 0
      ? localize(
          locale,
          "当前治理队列里没有可自动执行的整批修复动作，剩余问题更可能需要手工编辑或宿主机同步。",
          "There was no auto-repair action to execute across the queue. Remaining issues likely need manual edits or host sync."
        )
      : input.hostSyncRequiredAppCount > 0
        ? localize(
            locale,
            `已先收敛 ${input.repairedAppCount} 个应用的控制台配置，但其中 ${input.hostSyncRequiredAppCount} 个应用仍需要继续做宿主机同步。`,
            `Console-side repair was applied to ${input.repairedAppCount} app(s), but ${input.hostSyncRequiredAppCount} app(s) still require host sync.`
          )
        : localize(
            locale,
            `已对 ${input.repairedAppCount} 个应用执行整批 MCP 治理，下一步应确认 runtime、审计和真实请求是否一起收敛。`,
            `Batch MCP governance was applied to ${input.repairedAppCount} app(s). Next, confirm runtime, audit, and live requests are converging together.`
          ),
  actions: [
    {
      id: "mcp-governance-batch-open-panel",
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: "mcp-governance-batch-open-audit",
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp"
      }
    }
  ]
});

export const buildMcpGovernanceRepairFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly appCode: AppBinding["appCode"];
    readonly requiresHostSync: boolean;
  }
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "MCP 治理修复已执行", "MCP Governance Repair Applied"),
  summary: input.requiresHostSync
    ? localize(
        locale,
        "控制台内的 MCP 冲突已经先做止损，但宿主机托管配置可能仍需重新同步。",
        "Console-side MCP conflicts were contained first, but managed host config may still need to be synced."
      )
    : localize(
        locale,
        "控制台内的 MCP 冲突已经收敛，下一步应确认 runtime 和真实请求是否一起恢复。",
        "Console-side MCP conflicts have converged. Next, confirm runtime and live requests recover together."
      ),
  actions: [
    {
      id: `mcp-governance-follow-section-${input.appCode}`,
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: `mcp-governance-follow-audit-${input.appCode}`,
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp",
        appCode: input.appCode
      }
    },
    {
      id: `mcp-governance-follow-logs-${input.appCode}`,
      label: localize(locale, "查看该应用请求", "Open App Requests"),
      kind: "app-logs",
      appCode: input.appCode
    }
  ]
});

export const buildMcpImportedFromHostFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  appCode: AppBinding["appCode"]
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "宿主机 MCP 已导入", "Host MCP Imported"),
  summary: localize(
    locale,
    "下一步应检查 MCP 面板和相关审计，确认导入结果与控制台状态一致。",
    "Next, inspect the MCP panel and related audit events to confirm the imported result matches the console state."
  ),
  actions: [
    {
      id: `mcp-import-follow-section-${appCode}`,
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: `mcp-import-follow-audit-${appCode}`,
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp",
        appCode
      }
    }
  ]
});

export const buildMcpHostSyncAppliedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  appCode: AppBinding["appCode"]
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "宿主机 MCP 已同步", "Host MCP Applied"),
  summary: localize(
    locale,
    "下一步应检查 MCP runtime、宿主机漂移状态和相关审计事件。",
    "Next, inspect MCP runtime, host drift state, and related audit events."
  ),
  actions: [
    {
      id: `mcp-apply-follow-section-${appCode}`,
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: `mcp-apply-follow-audit-${appCode}`,
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp",
        appCode
      }
    }
  ]
});

export const buildBatchMcpHostSyncAppliedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  appliedAppCount: number
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "整批宿主机同步已执行", "Batch Host Sync Applied"),
  summary:
    appliedAppCount === 0
      ? localize(
          locale,
          "当前没有待同步的宿主机 MCP 变更，控制台与宿主机托管配置看起来已经一致。",
          "There are no pending host MCP sync changes right now. Console state and managed host config already look aligned."
        )
      : localize(
          locale,
          `已对 ${appliedAppCount} 个应用执行宿主机同步，下一步应检查 runtime、漂移状态和 MCP 审计是否一起收敛。`,
          `Host sync was applied for ${appliedAppCount} app(s). Next, confirm runtime, drift state, and MCP audit converge together.`
        ),
  actions: [
    {
      id: "mcp-host-sync-batch-open-panel",
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: "mcp-host-sync-batch-open-audit",
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp"
      }
    }
  ]
});

export const buildBatchMcpConvergedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly repairedAppCount: number;
    readonly appliedAppCount: number;
  }
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "整批 MCP 收敛已执行", "Batch MCP Converged"),
  summary:
    input.repairedAppCount === 0 && input.appliedAppCount === 0
      ? localize(
          locale,
          "当前没有额外 MCP 控制台修复或宿主机同步需要执行，治理队列与宿主机托管状态看起来已经基本一致。",
          "There is no additional MCP console repair or host sync work to execute right now. The governance queue and managed host state already look aligned."
        )
      : input.appliedAppCount === 0
        ? localize(
            locale,
            `已先收敛 ${input.repairedAppCount} 个应用的控制台治理，当前没有额外宿主机同步差异需要继续下发。`,
            `Console-side governance converged for ${input.repairedAppCount} app(s), and there is no additional host sync diff to apply afterward.`
          )
        : localize(
            locale,
            `已先收敛 ${input.repairedAppCount} 个应用的控制台治理，并完成 ${input.appliedAppCount} 个应用的宿主机同步。下一步应确认 runtime、漂移状态和 MCP 审计是否一起收敛。`,
            `Console-side governance converged for ${input.repairedAppCount} app(s), and host sync completed for ${input.appliedAppCount} app(s). Next, confirm runtime, drift state, and MCP audit converge together.`
          ),
  actions: [
    {
      id: "mcp-converged-batch-open-panel",
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: "mcp-converged-batch-open-audit",
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp"
      }
    }
  ]
});

export const buildBatchMcpConvergenceReviewFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly repairedAppCount: number;
    readonly reviewRequiredApps: readonly AppBinding["appCode"][];
  }
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(
    locale,
    "整批 MCP 已推进到宿主机确认",
    "Batch MCP Advanced To Host Review"
  ),
  summary:
    input.repairedAppCount === 0
      ? localize(
          locale,
          `当前没有额外控制台修复动作，但 ${input.reviewRequiredApps.length} 个应用的 Host Sync 涉及移除项，需先确认后再继续下发。`,
          `${input.reviewRequiredApps.length} app(s) now have destructive host-sync removals that must be confirmed before continuing, even though no extra console repair action was needed.`
        )
      : localize(
          locale,
          `已先收敛 ${input.repairedAppCount} 个应用的控制台治理，但 ${input.reviewRequiredApps.length} 个应用的 Host Sync 涉及移除项，流程已停在确认阶段。`,
          `Console-side governance converged for ${input.repairedAppCount} app(s), but ${input.reviewRequiredApps.length} app(s) now have destructive host-sync removals, so the flow stopped at the review step.`
        ),
  actions: [
    {
      id: "mcp-converged-review-open-panel",
      label: localize(locale, "返回 MCP 面板确认移除项", "Return To MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: "mcp-converged-review-open-audit",
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp"
      }
    }
  ]
});

export const buildBatchMcpHostSyncRolledBackFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  rolledBackAppCount: number
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "整批宿主机 MCP 已回滚", "Batch Host MCP Rolled Back"),
  summary:
    rolledBackAppCount === 0
      ? localize(
          locale,
          "当前没有可回滚的宿主机 MCP 托管状态，说明最近没有可恢复的托管落盘残留。",
          "There is no managed host MCP state available to roll back right now, so no recoverable managed host residue was found."
        )
      : localize(
          locale,
          `已回滚 ${rolledBackAppCount} 个应用的宿主机 MCP 托管状态。下一步应确认宿主机文件、MCP 漂移和审计都回到预期基线。`,
          `Managed host MCP state was rolled back for ${rolledBackAppCount} app(s). Next, confirm host files, MCP drift, and audit all return to the expected baseline.`
        ),
  actions: [
    {
      id: "mcp-host-rollback-batch-open-panel",
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: "mcp-host-rollback-batch-open-audit",
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp"
      }
    }
  ]
});

export const buildMcpHostSyncRolledBackFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  appCode: AppBinding["appCode"]
): DashboardFollowUpNotice => ({
  category: "mcp",
  title: localize(locale, "宿主机 MCP 已回滚", "Host MCP Rolled Back"),
  summary: localize(
    locale,
    "下一步应确认宿主机配置是否已回到预期状态，并检查 MCP 漂移是否清除。",
    "Next, confirm the host config has returned to the expected state and verify MCP drift is cleared."
  ),
  actions: [
    {
      id: `mcp-rollback-follow-section-${appCode}`,
      label: localize(locale, "打开 MCP 面板", "Open MCP Panel"),
      kind: "section",
      section: "mcp"
    },
    {
      id: `mcp-rollback-follow-audit-${appCode}`,
      label: localize(locale, "查看 MCP 审计", "Open MCP Audit"),
      kind: "audit",
      filters: {
        source: "mcp",
        appCode
      }
    }
  ]
});

export const buildPromptHostImportedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly appCode: AppBinding["appCode"];
    readonly matchedExisting: boolean;
  }
): DashboardFollowUpNotice => ({
  category: "asset",
  title: localize(locale, "宿主机 Prompt 已导入", "Host Prompt Imported"),
  summary: input.matchedExisting
    ? localize(
        locale,
        "宿主机 Prompt 内容已与现有资产匹配，没有创建重复 Prompt。下一步应回到资产区确认该对象，再决定是否继续发布到宿主机。",
        "The host prompt already matches an existing asset, so no duplicate prompt was created. Review that asset in the console before publishing it back to the host."
      )
    : localize(
        locale,
        "宿主机 Prompt 已导入为禁用资产，当前不会隐式改变运行态。下一步应审阅这份资产，再决定是否启用或继续下发。",
        "The host prompt was imported as a disabled asset, so runtime behavior does not change implicitly. Review the asset before enabling or syncing it."
      ),
  actions: [
    {
      id: `prompt-host-import-assets-${input.appCode}`,
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    },
    {
      id: `prompt-host-import-runtime-${input.appCode}`,
      label: localize(locale, "打开运行时", "Open Runtime"),
      kind: "section",
      section: "runtime"
    },
    {
      id: `prompt-host-import-audit-${input.appCode}`,
      label: localize(locale, "查看宿主机审计", "Open Host Audit"),
      kind: "audit",
      filters: {
        source: "host-integration",
        appCode: input.appCode
      }
    }
  ]
});

export const buildBatchPromptHostSyncAppliedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  appliedAppCount: number
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "整批 Prompt 宿主机同步已执行", "Batch Prompt Host Sync Applied"),
  summary:
    appliedAppCount === 0
      ? localize(
          locale,
          "当前没有额外 Prompt 宿主机差异需要下发，控制台与宿主机文件已基本一致。",
          "There is no additional prompt host diff to apply right now. The console and host files are already largely aligned."
        )
      : localize(
          locale,
          `已完成 ${appliedAppCount} 个应用的 Prompt 宿主机同步。下一步应按应用检查宿主机文件、运行态与审计是否一起收敛。`,
          `Prompt host sync was applied for ${appliedAppCount} app(s). Next, verify host files, runtime, and audit converge together for each app.`
        ),
  actions: [
    {
      id: "prompt-host-apply-all-assets",
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    },
    {
      id: "prompt-host-apply-all-runtime",
      label: localize(locale, "打开运行时", "Open Runtime"),
      kind: "section",
      section: "runtime"
    },
    {
      id: "prompt-host-apply-all-audit",
      label: localize(locale, "查看宿主机审计", "Open Host Audit"),
      kind: "audit",
      filters: {
        source: "host-integration"
      }
    }
  ]
});

export const buildPromptHostSyncAppliedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly appCode: AppBinding["appCode"];
    readonly ignoredSkillId: string | null;
  }
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "宿主机 Prompt 已同步", "Host Prompt Applied"),
  summary: input.ignoredSkillId !== null
    ? localize(
        locale,
        "Prompt 已写入宿主机文件，但关联 Skill 仍保持代理侧注入。下一步应同时验证宿主机文件、运行态与真实请求。",
        "The prompt was written to the host file, but the linked skill still remains proxy-only. Validate the host file, runtime, and live requests together next."
      )
    : localize(
        locale,
        "Prompt 已写入宿主机文件。下一步应确认当前 CLI 已读取新的宿主机 Prompt，并检查运行态和审计事件是否一致。",
        "The prompt was written to the host file. Confirm the CLI is now reading the new host prompt and check that runtime and audit events stay aligned."
      ),
  actions: [
    {
      id: `prompt-host-apply-assets-${input.appCode}`,
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    },
    {
      id: `prompt-host-apply-runtime-${input.appCode}`,
      label: localize(locale, "打开运行时", "Open Runtime"),
      kind: "section",
      section: "runtime"
    },
    {
      id: `prompt-host-apply-audit-${input.appCode}`,
      label: localize(locale, "查看宿主机审计", "Open Host Audit"),
      kind: "audit",
      filters: {
        source: "host-integration",
        appCode: input.appCode
      }
    }
  ]
});

export const buildPromptHostSyncRolledBackFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  appCode: AppBinding["appCode"]
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "宿主机 Prompt 已回滚", "Host Prompt Rolled Back"),
  summary: localize(
    locale,
    "宿主机 Prompt 文件已恢复到上一份状态。下一步应确认 CLI 行为、宿主机文件与回滚审计是否一致。",
    "The host prompt file was restored to its previous state. Confirm CLI behavior, the host file, and rollback audit events stay aligned."
  ),
  actions: [
    {
      id: `prompt-host-rollback-assets-${appCode}`,
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    },
    {
      id: `prompt-host-rollback-runtime-${appCode}`,
      label: localize(locale, "打开运行时", "Open Runtime"),
      kind: "section",
      section: "runtime"
    },
    {
      id: `prompt-host-rollback-audit-${appCode}`,
      label: localize(locale, "查看宿主机审计", "Open Host Audit"),
      kind: "audit",
      filters: {
        source: "host-integration",
        appCode
      }
    }
  ]
});

export const buildProviderRecoveredFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  providerId: string
): DashboardFollowUpNotice => ({
  category: "provider",
  title: localize(locale, "Provider 已恢复", "Provider Recovered"),
  summary: localize(
    locale,
    "下一步应回到接管闭环验证路径，确认 Provider runtime、健康事件和真实请求结果正在一起改善。",
    "Next, return to the takeover verification loop and confirm provider runtime, health events, and real request outcomes are improving together."
  ),
  actions: [
    {
      id: `runtime-recover-provider-${providerId}`,
      label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
      kind: "provider-runtime",
      providerId
    },
    {
      id: `runtime-recover-logs-${providerId}`,
      label: localize(locale, "查看失败请求", "Open Failure Logs"),
      kind: "provider-logs",
      providerId
    },
    {
      id: `runtime-recover-traffic-${providerId}`,
      label: localize(locale, "回到流量验证", "Back To Traffic Verification"),
      kind: "section",
      section: "traffic"
    }
  ]
});

export const buildProviderIsolatedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  providerId: string
): DashboardFollowUpNotice => ({
  category: "provider",
  title: localize(locale, "Provider 已隔离", "Provider Isolated"),
  summary: localize(
    locale,
    "下一步应确认请求是否已经停止继续命中该 Provider，并观察故障转移是否接管。",
    "Next, confirm requests have stopped hitting this provider and verify failover is taking over."
  ),
  actions: [
    {
      id: `runtime-isolate-provider-${providerId}`,
      label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
      kind: "provider-runtime",
      providerId
    },
    {
      id: `runtime-isolate-logs-${providerId}`,
      label: localize(locale, "查看失败请求", "Open Failure Logs"),
      kind: "provider-logs",
      providerId
    }
  ]
});

export const buildProviderResetFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  providerId: string
): DashboardFollowUpNotice => ({
  category: "provider",
  title: localize(locale, "Provider 已重置", "Provider Reset"),
  summary: localize(
    locale,
    "下一步应确认熔断状态是否已清空，并观察新的请求结果。",
    "Next, confirm the circuit state is cleared and inspect new request outcomes."
  ),
  actions: [
    {
      id: `runtime-reset-provider-${providerId}`,
      label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
      kind: "provider-runtime",
      providerId
    },
    {
      id: `runtime-reset-logs-${providerId}`,
      label: localize(locale, "查看失败请求", "Open Failure Logs"),
      kind: "provider-logs",
      providerId
    }
  ]
});

export const buildProviderProbedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  providerId: string
): DashboardFollowUpNotice => ({
  category: "provider",
  title: localize(locale, "Provider 已探测", "Provider Probed"),
  summary: localize(
    locale,
    "下一步应回到接管闭环验证路径，确认探测结果、运行态和真实请求结果是否一致。",
    "Next, return to the takeover verification loop and confirm the probe result, runtime, and real request outcomes are aligned."
  ),
  actions: [
    {
      id: `runtime-probe-provider-${providerId}`,
      label: localize(locale, "打开 Provider 运行态", "Open Provider Runtime"),
      kind: "provider-runtime",
      providerId
    },
    {
      id: `runtime-probe-audit-${providerId}`,
      label: localize(locale, "查看健康审计", "Open Health Audit"),
      kind: "audit",
      filters: {
        source: "provider-health",
        providerId
      }
    },
    {
      id: `runtime-probe-traffic-${providerId}`,
      label: localize(locale, "回到流量验证", "Back To Traffic Verification"),
      kind: "section",
      section: "traffic"
    }
  ]
});

export const buildHostTakeoverAppliedFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  appCode: AppBinding["appCode"],
  result?: {
    readonly takeoverMode?: "file-rewrite" | "environment-override";
    readonly environmentOverride?: {
      readonly activationCommands?: string[];
    } | null;
  }
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "宿主机接管已应用", "Host Takeover Applied"),
  summary:
    result?.takeoverMode === "environment-override"
      ? localize(
          locale,
          `下一步先在目标 shell 中执行 ${result.environmentOverride?.activationCommands?.[0] ?? "source <managed-script>"}，再发送真实请求，确认环境变量接管已把流量切到本地网关。`,
          `Next, run ${result.environmentOverride?.activationCommands?.[0] ?? "source <managed-script>"} in the target shell, then send a real request and confirm environment takeover routes traffic to the local gateway.`
        )
      : appCode === "claude-code"
      ? localize(
          locale,
          "下一步应进入接管闭环验证，确认 Claude Code 已切到本地网关、真实请求已进入代理，并验证初次安装确认已被跳过。",
          "Next, enter the takeover verification loop and confirm Claude Code is pointed at the local gateway, real requests are reaching the proxy, and the first-run confirmation is bypassed."
        )
      : localize(
          locale,
          "下一步应进入接管闭环验证，确认宿主机配置已切到本地网关，并检查真实请求与接管事件是否一致。",
          "Next, enter the takeover verification loop and confirm the host configuration points to the local gateway while real requests and takeover events stay aligned."
        ),
  actions: [
    {
      id: `host-apply-audit-${appCode}`,
      label: localize(locale, "查看宿主机审计", "Open Host Audit"),
      kind: "audit",
      filters: {
        source: "host-integration",
        appCode
      }
    },
    {
      id: `host-apply-runtime-${appCode}`,
      label: localize(locale, "打开运行时", "Open Runtime"),
      kind: "section",
      section: "runtime"
    },
    {
      id: `host-apply-traffic-${appCode}`,
      label: localize(locale, "查看流量验证", "Open Traffic Verification"),
      kind: "app-logs",
      appCode
    }
  ]
});

export const buildHostTakeoverRolledBackFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  appCode: AppBinding["appCode"]
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "宿主机接管已回滚", "Host Takeover Rolled Back"),
  summary:
    appCode === "claude-code"
      ? localize(
          locale,
          "下一步应确认 Claude Code 已恢复原始配置，并验证初次安装确认状态也已恢复。",
          "Next, confirm Claude Code is back on its original configuration and verify the first-run confirmation state is restored."
        )
      : localize(
          locale,
          "下一步应确认宿主机配置已经回到原始状态，并检查回滚事件是否落库。",
          "Next, confirm the host configuration has been restored and inspect the recorded rollback event."
        ),
  actions: [
    {
      id: `host-rollback-audit-${appCode}`,
      label: localize(locale, "查看宿主机审计", "Open Host Audit"),
      kind: "audit",
      filters: {
        source: "host-integration",
        appCode
      }
    },
    {
      id: `host-rollback-runtime-${appCode}`,
      label: localize(locale, "打开运行时", "Open Runtime"),
      kind: "section",
      section: "runtime"
    }
  ]
});

export const buildForegroundHostTakeoversRolledBackFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly rolledBackAppCount: number;
    readonly failedAppCount: number;
  }
): DashboardFollowUpNotice => ({
  category: "app-traffic",
  title: localize(locale, "临时宿主机接管已回滚", "Temporary Host Takeovers Rolled Back"),
  summary:
    input.rolledBackAppCount === 0
      ? localize(
          locale,
          "当前没有需要回滚的临时宿主机接管。",
          "There are no temporary host takeovers that need rollback right now."
        )
      : input.failedAppCount === 0
        ? localize(
            locale,
            `已回滚 ${input.rolledBackAppCount} 个临时宿主机接管。下一步应确认宿主机文件、运行态和审计记录已经一起恢复。`,
            `Rolled back ${input.rolledBackAppCount} temporary host takeover(s). Confirm host files, runtime, and audit records have converged.`
          )
        : localize(
            locale,
            `已回滚 ${input.rolledBackAppCount} 个临时宿主机接管，但仍有 ${input.failedAppCount} 个应用需要人工检查宿主机文件与备份。`,
            `Rolled back ${input.rolledBackAppCount} temporary host takeover(s), but ${input.failedAppCount} app(s) still need manual host-file and backup review.`
          ),
  actions: [
    {
      id: "host-rollback-foreground-audit",
      label: localize(locale, "查看宿主机审计", "Open Host Audit"),
      kind: "audit",
      filters: {
        source: "host-integration"
      }
    },
    {
      id: "host-rollback-foreground-runtime",
      label: localize(locale, "打开运行时", "Open Runtime"),
      kind: "section",
      section: "runtime"
    }
  ]
});

export const buildAssetGovernanceRepairFollowUpNotice = (
  locale: "zh-CN" | "en-US",
  input: {
    readonly appCode?: AppBinding["appCode"];
    readonly repairedItems: number;
    readonly remainingManualItems: number;
  }
): DashboardFollowUpNotice => ({
  category: "asset",
  title: localize(locale, "资产治理修复已执行", "Asset Governance Repair Applied"),
  summary:
    input.repairedItems === 0
      ? input.remainingManualItems > 0
        ? localize(
            locale,
            "当前高风险资产里没有适合自动执行的保守修复动作，剩余问题需要人工确认 Prompt / Skill 继承链。",
            "No conservative auto-repair action was safe to apply. Remaining issues still need manual prompt/skill review."
          )
        : localize(
            locale,
            "当前资产治理队列里没有需要修复的高风险项。",
            "There are no high-risk asset issues that require repair right now."
          )
      : input.remainingManualItems > 0
        ? localize(
            locale,
            `已自动修复 ${input.repairedItems} 个高风险资产，但仍有 ${input.remainingManualItems} 个问题需要人工处理。`,
            `Automatically repaired ${input.repairedItems} high-risk asset(s), but ${input.remainingManualItems} item(s) still need manual handling.`
          )
        : localize(
            locale,
            `已自动修复 ${input.repairedItems} 个高风险资产，下一步应确认工作区、会话和真实流量是否一起收敛。`,
            `Automatically repaired ${input.repairedItems} high-risk asset(s). Next, confirm workspaces, sessions, and live traffic converge together.`
          ),
  actions: [
    {
      id: `asset-governance-assets-${input.appCode ?? "all"}`,
      label: localize(locale, "返回上下文资产", "Back To Context Assets"),
      kind: "section",
      section: "assets"
    },
    {
      id: `asset-governance-runtime-${input.appCode ?? "all"}`,
      label: localize(locale, "查看运行态", "Open Runtime"),
      kind: "section",
      section: "runtime"
    },
    ...(input.appCode
      ? [
          {
            id: `asset-governance-logs-${input.appCode}`,
            label: localize(locale, "查看该应用请求", "Open App Logs"),
            kind: "app-logs" as const,
            appCode: input.appCode
          }
        ]
      : [])
  ]
});

export const buildConfigImportedFollowUpNotice = (
  locale: "zh-CN" | "en-US"
): DashboardFollowUpNotice => ({
  category: "recovery",
  title: localize(locale, "配置已导入", "Config Imported"),
  summary: localize(
    locale,
    "下一步应优先查看恢复面板、运行时和流量面板，确认导入后的真实生效状态。",
    "Next, inspect recovery, runtime, and traffic panels to confirm the real post-import state."
  ),
  actions: [
    {
      id: "recovery-import-follow-recovery",
      label: localize(locale, "打开恢复面板", "Open Recovery"),
      kind: "section",
      section: "recovery"
    },
    {
      id: "recovery-import-follow-runtime",
      label: localize(locale, "打开运行时面板", "Open Runtime Panel"),
      kind: "section",
      section: "runtime"
    },
    {
      id: "recovery-import-follow-traffic",
      label: localize(locale, "打开流量面板", "Open Traffic Panel"),
      kind: "section",
      section: "traffic"
    }
  ]
});

export const buildSnapshotRestoredFollowUpNotice = (
  locale: "zh-CN" | "en-US"
): DashboardFollowUpNotice => ({
  category: "recovery",
  title: localize(locale, "快照已恢复", "Snapshot Restored"),
  summary: localize(
    locale,
    "下一步应检查恢复后的运行态、流量和相关编辑面板，确认系统已回到预期状态。",
    "Next, inspect runtime, traffic, and related edit panels to confirm the system has returned to the expected state."
  ),
  actions: [
    {
      id: "recovery-restore-follow-recovery",
      label: localize(locale, "打开恢复面板", "Open Recovery"),
      kind: "section",
      section: "recovery"
    },
    {
      id: "recovery-restore-follow-runtime",
      label: localize(locale, "打开运行时面板", "Open Runtime Panel"),
      kind: "section",
      section: "runtime"
    },
    {
      id: "recovery-restore-follow-traffic",
      label: localize(locale, "打开流量面板", "Open Traffic Panel"),
      kind: "section",
      section: "traffic"
    }
  ]
});
