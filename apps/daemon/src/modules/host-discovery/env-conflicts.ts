import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { AppCode, HostCliDiscovery } from "@cc-switch-web/shared";

type HostCliEnvConflict = HostCliDiscovery["envConflicts"][number];

const SHELL_CONFIG_PATHS = [
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile"
];

const ENVIRONMENT_CONFIG_PATHS = [
  ".pam_environment"
];

const APP_ENV_PREFIXES: Partial<Record<AppCode, string[]>> = {
  codex: ["OPENAI_", "CODEX_"],
  "claude-code": ["ANTHROPIC_", "CLAUDE_CODE_"]
};

const ENV_ASSIGNMENT_PATTERN = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

const isSensitiveVariable = (variableName: string): boolean =>
  /(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(variableName);

const trimInlineComment = (value: string): string => {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if ((current === "'" || current === '"') && (index === 0 || value[index - 1] !== "\\")) {
      quote = quote === current ? null : quote ?? current;
      continue;
    }
    if (current === "#" && quote === null) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
};

const normalizeValue = (rawValue: string): string => {
  const trimmed = trimInlineComment(rawValue).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const buildValuePreview = (variableName: string, value: string): string => {
  if (!isSensitiveVariable(variableName)) {
    return value;
  }

  if (value.length <= 8) {
    return value.length === 0 ? "" : `${value.slice(0, 2)}****`;
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
};

const buildReason = (variableName: string): string => {
  if (/(?:BASE_URL|API_BASE)/i.test(variableName)) {
    return "Detected upstream base URL override outside managed host config.";
  }
  if (/(?:AUTH_TOKEN|API_KEY|KEY|TOKEN|SECRET)/i.test(variableName)) {
    return "Detected credential override outside managed host config.";
  }
  return "Detected CLI-related environment override outside managed host config.";
};

const listEnvironmentFilePaths = (homeDir: string): string[] => {
  const paths = ENVIRONMENT_CONFIG_PATHS.map((filePath) => resolve(homeDir, filePath));
  const environmentDir = resolve(homeDir, ".config/environment.d");

  if (existsSync(environmentDir)) {
    for (const entry of readdirSync(environmentDir, { withFileTypes: true })) {
      if (entry.isFile()) {
        paths.push(join(environmentDir, entry.name));
      }
    }
  }

  paths.push("/etc/environment");

  return paths;
};

const matchesAppPrefix = (variableName: string, appCode: AppCode): boolean => {
  const prefixes = APP_ENV_PREFIXES[appCode] ?? [];
  const upperCaseName = variableName.toUpperCase();
  return prefixes.some((prefix) => upperCaseName.startsWith(prefix));
};

const pushConflict = (
  items: HostCliEnvConflict[],
  next: HostCliEnvConflict
): void => {
  const duplicate = items.some(
    (item) =>
      item.variableName === next.variableName &&
      item.sourceType === next.sourceType &&
      item.sourcePath === next.sourcePath &&
      item.lineNumber === next.lineNumber
  );

  if (!duplicate) {
    items.push(next);
  }
};

const parseConfigFileConflicts = (
  appCode: AppCode,
  filePath: string,
  sourceType: HostCliEnvConflict["sourceType"]
): HostCliEnvConflict[] => {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, "utf-8");
  const conflicts: HostCliEnvConflict[] = [];

  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const matched = trimmed.match(ENV_ASSIGNMENT_PATTERN);
    if (matched === null) {
      continue;
    }

    const variableName = matched[1]?.trim() ?? "";
    if (!matchesAppPrefix(variableName, appCode)) {
      continue;
    }

    const value = normalizeValue(matched[2] ?? "");
    pushConflict(conflicts, {
      variableName,
      valuePreview: buildValuePreview(variableName, value),
      sourceType,
      sourcePath: filePath,
      lineNumber: index + 1,
      reason: buildReason(variableName)
    });
  }

  return conflicts;
};

export const scanHostCliEnvConflicts = (options: {
  readonly appCode: AppCode;
  readonly homeDir: string;
  readonly processEnv?: NodeJS.ProcessEnv;
}): HostCliEnvConflict[] => {
  const { appCode, homeDir } = options;
  if (APP_ENV_PREFIXES[appCode] === undefined) {
    return [];
  }

  const processEnv = options.processEnv ?? process.env;
  const conflicts: HostCliEnvConflict[] = [];

  for (const [variableName, rawValue] of Object.entries(processEnv)) {
    if (!matchesAppPrefix(variableName, appCode) || typeof rawValue !== "string") {
      continue;
    }

    pushConflict(conflicts, {
      variableName,
      valuePreview: buildValuePreview(variableName, rawValue),
      sourceType: "process-env",
      sourcePath: "process.env",
      lineNumber: null,
      reason: buildReason(variableName)
    });
  }

  for (const fileName of SHELL_CONFIG_PATHS) {
    for (const conflict of parseConfigFileConflicts(
      appCode,
      resolve(homeDir, fileName),
      "shell-file"
    )) {
      pushConflict(conflicts, conflict);
    }
  }

  for (const filePath of listEnvironmentFilePaths(homeDir)) {
    for (const conflict of parseConfigFileConflicts(
      appCode,
      filePath,
      "environment-file"
    )) {
      pushConflict(conflicts, conflict);
    }
  }

  return conflicts;
};
