import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  nowIso,
  type AppCode,
  type EffectiveAppContext,
  type HostIntegrationEvent,
  type LocaleCode,
  type PromptHostImportPreview,
  type PromptHostImportResult,
  type PromptHostSyncBatchPreview,
  type PromptHostSyncBatchResult,
  type PromptHostSyncCapability,
  type PromptHostSyncPreview,
  type PromptHostSyncResult,
  type PromptHostSyncSelectionSource,
  type PromptHostSyncState,
  type PromptTemplateUpsert,
  type PromptTemplate
} from "cc-switch-web-shared";

import type { SqliteDatabase } from "../../db/database.js";
import type { PromptTemplateRepository } from "../assets/prompt-template-repository.js";

interface ManagedPromptFileAdapter {
  readonly appCode: AppCode;
  readonly promptFilePathHint: string;
  readonly promptFileName: string;
  readonly docsUrl: string | null;
  resolvePromptPath(homeDir: string): string;
}

interface PromptHostSyncStateRecord {
  readonly appCode: AppCode;
  readonly promptPath: string;
  readonly backupPath: string | null;
  readonly rollbackAction: "restore" | "delete";
  readonly selectionSource: PromptHostSyncSelectionSource;
  readonly activeContextSource: EffectiveAppContext["source"] | null;
  readonly promptTemplateId: string | null;
  readonly promptTemplateName: string | null;
  readonly promptLocale: PromptTemplate["locale"] | null;
  readonly lastAppliedAt: string;
}

interface PromptSelection {
  readonly source: PromptHostSyncSelectionSource;
  readonly activeContextSource: EffectiveAppContext["source"] | null;
  readonly promptTemplateId: string | null;
  readonly promptTemplateName: string | null;
  readonly promptLocale: PromptTemplate["locale"] | null;
  readonly content: string | null;
  readonly ignoredSkillId: string | null;
  readonly warnings: string[];
}

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true });
};

const readJsonObject = (filePath: string): Record<string, unknown> => {
  const content = readFileSync(filePath, "utf-8").trim();
  if (content.length === 0) {
    return {};
  }

  const parsed = JSON.parse(content) as unknown;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const codexPromptAdapter: ManagedPromptFileAdapter = {
  appCode: "codex",
  promptFilePathHint: "~/.codex/AGENTS.md",
  promptFileName: "AGENTS.md",
  docsUrl: "https://github.com/openai/codex",
  resolvePromptPath: (homeDir) => resolve(homeDir, ".codex/AGENTS.md")
};

const claudeCodePromptAdapter: ManagedPromptFileAdapter = {
  appCode: "claude-code",
  promptFilePathHint: "~/.claude/CLAUDE.md",
  promptFileName: "CLAUDE.md",
  docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
  resolvePromptPath: (homeDir) => resolve(homeDir, ".claude/CLAUDE.md")
};

const managedAdapters = [codexPromptAdapter, claudeCodePromptAdapter] as const;

const supportedAppCodes = ["codex", "claude-code", "gemini-cli", "opencode", "openclaw"] as const;

const hasManagedPromptCandidate = (item: PromptTemplate, appCode: AppCode | null): boolean =>
  item.enabled && isNonEmptyString(item.content) && item.appCode === appCode;

export class PromptHostSyncService {
  private readonly backupsDir: string;
  private readonly stateDir: string;

  constructor(
    private readonly options: {
      readonly dataDir: string;
      readonly database: SqliteDatabase;
      readonly promptTemplateRepository: PromptTemplateRepository;
      readonly upsertPromptTemplate: (input: PromptTemplateUpsert) => PromptTemplate;
      readonly resolveEffectiveContext: (appCode: AppCode) => EffectiveAppContext;
      readonly homeDir?: string;
    }
  ) {
    this.backupsDir = resolve(options.dataDir, "prompt-host-sync/backups");
    this.stateDir = resolve(options.dataDir, "prompt-host-sync/state");
    mkdirSync(this.backupsDir, { recursive: true });
    mkdirSync(this.stateDir, { recursive: true });
  }

  listCapabilities(): PromptHostSyncCapability[] {
    return supportedAppCodes.map((appCode) => {
      const adapter = managedAdapters.find((item) => item.appCode === appCode);
      if (adapter !== undefined) {
        return {
          appCode,
          supportLevel: "managed",
          promptFilePathHint: adapter.promptFilePathHint,
          promptFileName: adapter.promptFileName,
          docsUrl: adapter.docsUrl,
          reason: "Managed host prompt file rollout is available for this CLI."
        };
      }

      return {
        appCode,
        supportLevel: "planned",
        promptFilePathHint: null,
        promptFileName: null,
        docsUrl: null,
        reason: "Prompt host file rollout is planned after the upstream file contract is verified."
      };
    });
  }

  previewImport(appCode: AppCode): PromptHostImportPreview {
    const adapter = this.getManagedAdapter(appCode);
    const promptPath = adapter.resolvePromptPath(this.options.homeDir ?? homedir());
    if (!existsSync(promptPath)) {
      return {
        appCode,
        promptPath,
        promptFileExists: false,
        hasContent: false,
        status: "missing-file",
        matchedPromptTemplateId: null,
        matchedPromptTemplateName: null,
        inferredLocale: null,
        contentBytes: 0,
        lineCount: 0,
        warnings: [`Host prompt file does not exist and cannot be imported yet: ${promptPath}`]
      };
    }

    const content = readFileSync(promptPath, "utf-8");
    const normalizedContent = content.trim();
    const lineCount = normalizedContent.length === 0 ? 0 : normalizedContent.split(/\r?\n/).length;

    if (normalizedContent.length === 0) {
      return {
        appCode,
        promptPath,
        promptFileExists: true,
        hasContent: false,
        status: "empty-file",
        matchedPromptTemplateId: null,
        matchedPromptTemplateName: null,
        inferredLocale: null,
        contentBytes: Buffer.byteLength(content, "utf-8"),
        lineCount,
        warnings: [`Host prompt file is empty and cannot be imported: ${promptPath}`]
      };
    }

    const matchedPrompt = this.findMatchingPromptByContent(appCode, normalizedContent);
    const inferredLocale = matchedPrompt?.locale ?? this.inferLocale(normalizedContent);
    const warnings: string[] = [];
    if (matchedPrompt !== null) {
      warnings.push(
        `Host prompt content already exists in prompt ${matchedPrompt.id}; import will reuse the existing asset.`
      );
    } else {
      warnings.push(
        "Imported host prompt will be created as a disabled prompt template so runtime routing does not change implicitly."
      );
    }

    return {
      appCode,
      promptPath,
      promptFileExists: true,
      hasContent: true,
      status: matchedPrompt === null ? "ready-create" : "ready-match",
      matchedPromptTemplateId: matchedPrompt?.id ?? null,
      matchedPromptTemplateName: matchedPrompt?.name ?? null,
      inferredLocale,
      contentBytes: Buffer.byteLength(content, "utf-8"),
      lineCount,
      warnings
    };
  }

  importFromHost(appCode: AppCode): PromptHostImportResult {
    const preview = this.previewImport(appCode);
    if (preview.status === "missing-file" || preview.status === "empty-file") {
      throw new Error(preview.warnings[0] ?? `Host prompt cannot be imported for ${appCode}`);
    }

    if (preview.matchedPromptTemplateId !== null) {
      const matchedPrompt = this.options.promptTemplateRepository.get(preview.matchedPromptTemplateId);
      if (matchedPrompt === null) {
        throw new Error(`Matched prompt disappeared during import: ${preview.matchedPromptTemplateId}`);
      }

      return {
        appCode,
        promptPath: preview.promptPath,
        status: "matched-existing",
        promptTemplateId: matchedPrompt.id,
        promptTemplateName: matchedPrompt.name,
        inferredLocale: matchedPrompt.locale,
        enabled: matchedPrompt.enabled,
        message: `Host prompt already exists in assets as ${matchedPrompt.id}`
      };
    }

    const content = readFileSync(preview.promptPath, "utf-8").trim();
    const inferredLocale = preview.inferredLocale ?? this.inferLocale(content);
    const timestampLabel = nowIso().replace("T", " ").replace(".000Z", "Z");
    const promptTemplate = this.options.upsertPromptTemplate({
      id: `host-import-${appCode}-${randomUUID().slice(0, 8)}`,
      name: `Host Import ${appCode} ${timestampLabel}`,
      appCode,
      locale: inferredLocale,
      content,
      tags: ["host-import"],
      enabled: false
    });

    return {
      appCode,
      promptPath: preview.promptPath,
      status: "created",
      promptTemplateId: promptTemplate.id,
      promptTemplateName: promptTemplate.name,
      inferredLocale,
      enabled: promptTemplate.enabled,
      message: `Imported host prompt for ${appCode} as disabled asset ${promptTemplate.id}`
    };
  }

  previewApply(appCode: AppCode): PromptHostSyncPreview {
    const adapter = this.getManagedAdapter(appCode);
    const promptPath = adapter.resolvePromptPath(this.options.homeDir ?? homedir());
    const promptFileExists = existsSync(promptPath);
    const currentContent = promptFileExists ? readFileSync(promptPath, "utf-8") : null;
    const previousState = this.readState(appCode);
    const selection = this.resolvePromptSelection(appCode);
    const applyReady = selection.content !== null;
    const hasDiff = applyReady ? currentContent !== selection.content : false;
    const rollbackAction = previousState?.rollbackAction ?? (promptFileExists ? "restore" : "delete");
    const summary: string[] = [];
    const warnings = [...selection.warnings];

    if (selection.promptTemplateId !== null) {
      summary.push(
        `Selected prompt ${selection.promptTemplateId} for ${appCode} via ${this.describeSelectionSource(selection.source)}.`
      );
    } else if (selection.source === "ambiguous") {
      summary.push(`Prompt host sync is blocked because ${appCode} resolves multiple enabled prompt candidates.`);
    } else {
      summary.push(`Prompt host sync is blocked because no eligible prompt is available for ${appCode}.`);
    }

    if (applyReady) {
      summary.push(
        hasDiff
          ? `Host prompt file will be ${promptFileExists ? "updated" : "created"} at ${promptPath}.`
          : `Host prompt file already matches the selected prompt content at ${promptPath}.`
      );
    }

    summary.push(
      rollbackAction === "restore"
        ? "Rollback will restore the previous host prompt file."
        : "Rollback will delete the managed prompt file."
    );

    if (!promptFileExists) {
      warnings.push(`Host prompt file does not exist yet and will be created: ${promptPath}`);
    }

    return {
      appCode,
      promptPath,
      promptFileExists,
      backupRequired: previousState?.backupPath !== null || promptFileExists,
      rollbackAction,
      applyReady,
      selectionSource: selection.source,
      activeContextSource: selection.activeContextSource,
      promptTemplateId: selection.promptTemplateId,
      promptTemplateName: selection.promptTemplateName,
      promptLocale: selection.promptLocale,
      ignoredSkillId: selection.ignoredSkillId,
      hasDiff,
      summary,
      warnings,
      rollbackPlan: [
        {
          path: promptPath,
          action: rollbackAction
        }
      ]
    };
  }

  apply(appCode: AppCode): PromptHostSyncResult {
    const adapter = this.getManagedAdapter(appCode);
    const promptPath = adapter.resolvePromptPath(this.options.homeDir ?? homedir());
    const selection = this.resolvePromptSelection(appCode);

    if (selection.content === null || selection.promptTemplateId === null) {
      const preview = this.previewApply(appCode);
      throw new Error(preview.warnings[0] ?? `No eligible prompt can be synced for ${appCode}`);
    }

    const existingContent = existsSync(promptPath) ? readFileSync(promptPath, "utf-8") : null;
    const previousState = this.readState(appCode);
    const backupPath =
      previousState?.backupPath ??
      (existingContent === null ? null : this.createBackupFile(appCode, promptPath, existingContent));
    const rollbackAction = previousState?.rollbackAction ?? (existingContent === null ? "delete" : "restore");

    ensureParentDir(promptPath);
    writeFileSync(promptPath, selection.content, "utf-8");

    this.writeState({
      appCode,
      promptPath,
      backupPath,
      rollbackAction,
      selectionSource: selection.source,
      activeContextSource: selection.activeContextSource,
      promptTemplateId: selection.promptTemplateId,
      promptTemplateName: selection.promptTemplateName,
      promptLocale: selection.promptLocale,
      lastAppliedAt: nowIso()
    });

    const result: PromptHostSyncResult = {
      appCode,
      action: "apply",
      promptPath,
      backupPath,
      selectionSource: selection.source,
      promptTemplateId: selection.promptTemplateId,
      ignoredSkillId: selection.ignoredSkillId,
      message: this.buildApplyMessage(appCode, selection)
    };
    this.appendEvent({
      kind: "prompt-file",
      appCode,
      action: "apply",
      configPath: promptPath,
      backupPath,
      integrationState: "managed",
      message: result.message
    });
    return result;
  }

  rollback(appCode: AppCode): PromptHostSyncResult {
    const adapter = this.getManagedAdapter(appCode);
    const state = this.readState(appCode);

    if (state === null) {
      throw new Error(`No prompt host sync state found for app: ${appCode}`);
    }

    if (state.rollbackAction === "delete") {
      rmSync(state.promptPath, { force: true });
    } else if (state.backupPath !== null && existsSync(state.backupPath)) {
      ensureParentDir(state.promptPath);
      writeFileSync(state.promptPath, readFileSync(state.backupPath, "utf-8"), "utf-8");
    } else {
      throw new Error(`Backup file not found for prompt rollback: ${state.backupPath ?? "none"}`);
    }

    this.removeState(appCode);

    const result: PromptHostSyncResult = {
      appCode,
      action: "rollback",
      promptPath: adapter.resolvePromptPath(this.options.homeDir ?? homedir()),
      backupPath: state.backupPath,
      selectionSource: state.selectionSource,
      promptTemplateId: state.promptTemplateId,
      ignoredSkillId: null,
      message: `Prompt host sync rolled back for ${appCode}`
    };
    this.appendEvent({
      kind: "prompt-file",
      appCode,
      action: "rollback",
      configPath: result.promptPath,
      backupPath: result.backupPath,
      integrationState: "unmanaged",
      message: result.message
    });
    return result;
  }

  listSyncStates(): PromptHostSyncState[] {
    return managedAdapters
      .map((adapter) => this.readState(adapter.appCode))
      .filter((item): item is PromptHostSyncStateRecord => item !== null)
      .map((item) => ({
        appCode: item.appCode,
        promptPath: item.promptPath,
        backupPath: item.backupPath,
        rollbackAction: item.rollbackAction,
        selectionSource: item.selectionSource,
        activeContextSource: item.activeContextSource,
        promptTemplateId: item.promptTemplateId,
        promptTemplateName: item.promptTemplateName,
        promptLocale: item.promptLocale,
        lastAppliedAt: item.lastAppliedAt,
        promptFileExists: existsSync(item.promptPath)
      }));
  }

  previewApplyAll(): PromptHostSyncBatchPreview {
    const previews = managedAdapters.map((adapter) => this.previewApply(adapter.appCode));
    const items = previews.filter((item) => item.applyReady && item.hasDiff);
    const blockedApps = previews
      .filter((item) => !item.applyReady)
      .map((item) => item.appCode);

    return {
      totalApps: managedAdapters.length,
      syncableApps: items.length,
      blockedApps,
      items,
      warnings:
        items.length === 0
          ? ["No managed prompt host sync changes are pending across supported apps."]
          : []
    };
  }

  applyAll(): PromptHostSyncBatchResult {
    const preview = this.previewApplyAll();
    const items = preview.items.map((item: PromptHostSyncPreview) => this.apply(item.appCode));
    const appliedApps = items.map((item: PromptHostSyncResult) => item.appCode);

    return {
      totalApps: managedAdapters.length,
      appliedApps,
      skippedApps: managedAdapters
        .map((adapter) => adapter.appCode)
        .filter((appCode) => !appliedApps.includes(appCode)),
      items,
      message:
        items.length === 0
          ? "No managed prompt host sync changes were applied."
          : `Applied prompt host sync for ${items.length} app(s).`
    };
  }

  private getManagedAdapter(appCode: AppCode): ManagedPromptFileAdapter {
    const adapter = managedAdapters.find((item) => item.appCode === appCode);
    if (adapter === undefined) {
      throw new Error(`Prompt host sync is not supported yet for app: ${appCode}`);
    }

    return adapter;
  }

  private resolvePromptSelection(appCode: AppCode): PromptSelection {
    const context = this.options.resolveEffectiveContext(appCode);
    const warnings: string[] = [];
    const ignoredSkillId =
      context.skill.id !== null && context.skill.enabled === true && isNonEmptyString(context.skill.content)
        ? context.skill.id
        : null;

    if (ignoredSkillId !== null) {
      warnings.push(
        `Active skill ${ignoredSkillId} remains proxy-only and will not be written into the ${appCode} host prompt file.`
      );
    }

    if (context.promptTemplate.id !== null) {
      if (context.promptTemplate.enabled === true && isNonEmptyString(context.promptTemplate.content)) {
        return {
          source: "active-context",
          activeContextSource: context.source,
          promptTemplateId: context.promptTemplate.id,
          promptTemplateName: context.promptTemplate.name,
          promptLocale: context.promptTemplate.locale,
          content: context.promptTemplate.content,
          ignoredSkillId,
          warnings
        };
      }

      warnings.push(
        `Active context points to prompt ${context.promptTemplate.id}, but it is disabled or empty and cannot be synced.`
      );
    }

    const prompts = this.options.promptTemplateRepository.list();
    const appScopedCandidates = prompts.filter((item) => hasManagedPromptCandidate(item, appCode));
    if (appScopedCandidates.length === 1) {
      const item = appScopedCandidates[0] as PromptTemplate;
      return {
        source: "single-app-prompt",
        activeContextSource: context.source === "none" ? null : context.source,
        promptTemplateId: item.id,
        promptTemplateName: item.name,
        promptLocale: item.locale,
        content: item.content,
        ignoredSkillId,
        warnings
      };
    }

    if (appScopedCandidates.length > 1) {
      warnings.push(
        `Multiple enabled app-scoped prompts match ${appCode}: ${appScopedCandidates.map((item) => item.id).join(", ")}`
      );
      return {
        source: "ambiguous",
        activeContextSource: context.source === "none" ? null : context.source,
        promptTemplateId: null,
        promptTemplateName: null,
        promptLocale: null,
        content: null,
        ignoredSkillId,
        warnings
      };
    }

    const globalCandidates = prompts.filter((item) => hasManagedPromptCandidate(item, null));
    if (globalCandidates.length === 1) {
      const item = globalCandidates[0] as PromptTemplate;
      return {
        source: "single-global-prompt",
        activeContextSource: context.source === "none" ? null : context.source,
        promptTemplateId: item.id,
        promptTemplateName: item.name,
        promptLocale: item.locale,
        content: item.content,
        ignoredSkillId,
        warnings
      };
    }

    if (globalCandidates.length > 1) {
      warnings.push(
        `Multiple enabled global prompts are available for ${appCode}: ${globalCandidates.map((item) => item.id).join(", ")}`
      );
      return {
        source: "ambiguous",
        activeContextSource: context.source === "none" ? null : context.source,
        promptTemplateId: null,
        promptTemplateName: null,
        promptLocale: null,
        content: null,
        ignoredSkillId,
        warnings
      };
    }

    warnings.push(
      `No enabled prompt can be resolved for ${appCode}. Activate a matching workspace/session prompt or keep exactly one enabled fallback prompt.`
    );
    return {
      source: "missing",
      activeContextSource: context.source === "none" ? null : context.source,
      promptTemplateId: null,
      promptTemplateName: null,
      promptLocale: null,
      content: null,
      ignoredSkillId,
      warnings
    };
  }

  private describeSelectionSource(source: PromptHostSyncSelectionSource): string {
    switch (source) {
      case "active-context":
        return "active context";
      case "single-app-prompt":
        return "single app-scoped prompt fallback";
      case "single-global-prompt":
        return "single global prompt fallback";
      case "ambiguous":
        return "ambiguous prompt candidates";
      case "missing":
        return "missing prompt selection";
    }
  }

  private buildApplyMessage(appCode: AppCode, selection: PromptSelection): string {
    const base = `Prompt host sync applied for ${appCode} using ${selection.promptTemplateId} via ${this.describeSelectionSource(selection.source)}`;
    if (selection.ignoredSkillId !== null) {
      return `${base}; skill ${selection.ignoredSkillId} remains proxy-only`;
    }

    return base;
  }

  private findMatchingPromptByContent(appCode: AppCode, content: string): PromptTemplate | null {
    const candidates = this.options.promptTemplateRepository
      .list()
      .filter((item) => item.content.trim() === content && (item.appCode === appCode || item.appCode === null))
      .sort((left, right) => {
        const leftPriority = left.appCode === appCode ? 0 : 1;
        const rightPriority = right.appCode === appCode ? 0 : 1;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        if (left.enabled !== right.enabled) {
          return left.enabled ? -1 : 1;
        }
        return left.id.localeCompare(right.id);
      });

    return candidates[0] ?? null;
  }

  private inferLocale(content: string): LocaleCode {
    return /[\u3400-\u9FFF]/.test(content) ? "zh-CN" : "en-US";
  }

  private createBackupFile(appCode: AppCode, promptPath: string, content: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = resolve(this.backupsDir, `${appCode}-${timestamp}.backup`);
    writeFileSync(backupPath, content, "utf-8");
    return backupPath;
  }

  private statePath(appCode: AppCode): string {
    return resolve(this.stateDir, `${appCode}.json`);
  }

  private readState(appCode: AppCode): PromptHostSyncStateRecord | null {
    const path = this.statePath(appCode);
    if (!existsSync(path)) {
      return null;
    }

    const parsed = readJsonObject(path);
    if (
      typeof parsed.appCode !== "string" ||
      typeof parsed.promptPath !== "string" ||
      typeof parsed.rollbackAction !== "string" ||
      typeof parsed.selectionSource !== "string" ||
      typeof parsed.lastAppliedAt !== "string"
    ) {
      return null;
    }

    return {
      appCode: parsed.appCode as AppCode,
      promptPath: parsed.promptPath,
      backupPath: typeof parsed.backupPath === "string" ? parsed.backupPath : null,
      rollbackAction: parsed.rollbackAction === "delete" ? "delete" : "restore",
      selectionSource:
        parsed.selectionSource === "active-context" ||
        parsed.selectionSource === "single-app-prompt" ||
        parsed.selectionSource === "single-global-prompt" ||
        parsed.selectionSource === "ambiguous"
          ? parsed.selectionSource
          : "missing",
      activeContextSource:
        typeof parsed.activeContextSource === "string" ? (parsed.activeContextSource as EffectiveAppContext["source"]) : null,
      promptTemplateId: typeof parsed.promptTemplateId === "string" ? parsed.promptTemplateId : null,
      promptTemplateName: typeof parsed.promptTemplateName === "string" ? parsed.promptTemplateName : null,
      promptLocale:
        parsed.promptLocale === "zh-CN" || parsed.promptLocale === "en-US" ? parsed.promptLocale : null,
      lastAppliedAt: parsed.lastAppliedAt
    };
  }

  private writeState(record: PromptHostSyncStateRecord): void {
    ensureParentDir(this.statePath(record.appCode));
    writeFileSync(this.statePath(record.appCode), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  }

  private removeState(appCode: AppCode): void {
    rmSync(this.statePath(appCode), { force: true });
  }

  private appendEvent(
    input: Omit<HostIntegrationEvent, "id" | "createdAt">
  ): HostIntegrationEvent {
    const createdAt = nowIso();
    const result = this.options.database
      .prepare(`
        INSERT INTO host_integration_events (
          kind, app_code, action, config_path, backup_path, integration_state, message, created_at
        ) VALUES (
          @kind, @appCode, @action, @configPath, @backupPath, @integrationState, @message, @createdAt
        )
      `)
      .run({
        ...input,
        createdAt
      });

    return {
      id: Number(result.lastInsertRowid),
      createdAt,
      ...input
    };
  }
}
