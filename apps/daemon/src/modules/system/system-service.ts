import { demoSystemMetadata, type SystemMetadata } from "@ai-cli-switch/shared";

import type { DaemonEnv } from "../../config/env.js";
import type { DaemonStoragePaths } from "../../db/paths.js";
import { SnapshotService } from "../snapshots/snapshot-service.js";

export interface SystemRuntimeView {
  readonly daemonHost: string;
  readonly daemonPort: number;
  readonly allowedOrigins: string[];
  readonly allowAnyOrigin: boolean;
  readonly dataDir: string;
  readonly dbPath: string;
  readonly latestSnapshotVersion: number | null;
}

export class SystemService {
  constructor(
    private readonly env: DaemonEnv,
    private readonly storagePaths: DaemonStoragePaths,
    private readonly snapshotService: SnapshotService
  ) {}

  getMetadata(): SystemMetadata {
    return demoSystemMetadata;
  }

  getRuntime(): SystemRuntimeView {
    return {
      daemonHost: this.env.host,
      daemonPort: this.env.port,
      allowedOrigins: this.env.allowedOrigins,
      allowAnyOrigin: this.env.allowAnyOrigin,
      dataDir: this.storagePaths.dataDir,
      dbPath: this.storagePaths.dbPath,
      latestSnapshotVersion: this.snapshotService.latest()?.version ?? null
    };
  }
}
