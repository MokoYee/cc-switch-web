import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface DaemonStoragePaths {
  readonly dataDir: string;
  readonly dbPath: string;
}

export const resolveDaemonStoragePaths = (): DaemonStoragePaths => {
  const dataDir = resolve(
    process.env.CCSW_DATA_DIR ?? join(homedir(), ".cc-switch-web")
  );
  const dbPath = resolve(process.env.CCSW_DB_PATH ?? join(dataDir, "cc-switch-web.sqlite"));

  mkdirSync(dataDir, { recursive: true });

  return {
    dataDir,
    dbPath
  };
};
