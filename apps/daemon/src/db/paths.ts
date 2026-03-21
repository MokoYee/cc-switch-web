import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface DaemonStoragePaths {
  readonly dataDir: string;
  readonly dbPath: string;
}

export const resolveDaemonStoragePaths = (): DaemonStoragePaths => {
  const dataDir = resolve(
    process.env.AICLI_SWITCH_DATA_DIR ?? join(homedir(), ".ai-cli-switch")
  );
  const dbPath = resolve(process.env.AICLI_SWITCH_DB_PATH ?? join(dataDir, "ai-cli-switch.sqlite"));

  mkdirSync(dataDir, { recursive: true });

  return {
    dataDir,
    dbPath
  };
};
