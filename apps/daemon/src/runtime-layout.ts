import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const MAX_PARENT_DEPTH = 10;

const hasWorkspaceLayout = (candidate: string): boolean =>
  existsSync(join(candidate, "package.json")) &&
  existsSync(join(candidate, "apps", "cli")) &&
  existsSync(join(candidate, "apps", "daemon")) &&
  existsSync(join(candidate, "apps", "web"));

const findWorkspaceRoot = (startDirectory: string): string | null => {
  let candidate = resolve(startDirectory);

  for (let depth = 0; depth <= MAX_PARENT_DEPTH; depth += 1) {
    if (hasWorkspaceLayout(candidate)) {
      return candidate;
    }

    const parent = dirname(candidate);
    if (parent === candidate) {
      break;
    }
    candidate = parent;
  }

  return null;
};

/**
 * 从进程入口或当前目录定位 npm 包根目录，兼容源码、bundle 与全局安装布局。
 */
export const resolveWorkspaceRoot = (entryFilePath = process.argv[1]): string => {
  const startDirectories = [
    entryFilePath ? dirname(resolve(entryFilePath)) : null,
    process.cwd()
  ].filter((item): item is string => item !== null);

  for (const startDirectory of startDirectories) {
    const workspaceRoot = findWorkspaceRoot(startDirectory);
    if (workspaceRoot) {
      return workspaceRoot;
    }
  }

  throw new Error("cc-switch-web package root could not be resolved from the process entry");
};
