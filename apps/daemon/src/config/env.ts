export interface DaemonEnv {
  readonly runMode: "foreground" | "systemd-user";
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: string[];
  readonly allowAnyOrigin: boolean;
  readonly envControlToken: string | null;
  readonly controlUiMountPath: string;
  readonly healthProbeIntervalMs: number;
  readonly workspaceScanRoots: string[];
  readonly workspaceScanDepth: number;
  readonly sessionStaleMs: number;
}

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:8788",
  "http://localhost:8788"
];

const parseAllowedOrigins = (rawValue: string | undefined): string[] => {
  if (rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const resolveDaemonEnv = (): DaemonEnv => {
  const allowedOrigins = parseAllowedOrigins(
    process.env.ALLOWED_ORIGINS ?? process.env.AICLI_SWITCH_ALLOWED_ORIGINS
  );
  const configuredToken = process.env.AICLI_SWITCH_CONTROL_TOKEN?.trim() ?? null;
  const controlUiMountPath = process.env.AICLI_SWITCH_CONTROL_UI_PATH?.trim() || "/ui";

  return {
    runMode:
      process.env.AICLI_SWITCH_RUN_MODE?.trim() === "systemd-user"
        ? "systemd-user"
        : "foreground",
    host: process.env.AICLI_SWITCH_DAEMON_HOST ?? process.env.AICLI_SWITCH_HOST ?? "127.0.0.1",
    port: Number.parseInt(
      process.env.AICLI_SWITCH_DAEMON_PORT ?? process.env.AICLI_SWITCH_PORT ?? "8787",
      10
    ),
    allowedOrigins,
    allowAnyOrigin: allowedOrigins.includes("*"),
    envControlToken:
      configuredToken !== null && configuredToken.length > 0
        ? configuredToken
        : null,
    controlUiMountPath,
    healthProbeIntervalMs: Number.parseInt(
      process.env.AICLI_SWITCH_HEALTH_PROBE_INTERVAL_MS ?? "15000",
      10
    ),
    workspaceScanRoots: (process.env.AICLI_SWITCH_WORKSPACE_SCAN_ROOTS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    workspaceScanDepth: Number.parseInt(
      process.env.AICLI_SWITCH_WORKSPACE_SCAN_DEPTH ?? "3",
      10
    ),
    sessionStaleMs: Number.parseInt(
      process.env.AICLI_SWITCH_SESSION_STALE_MS ?? `${7 * 24 * 60 * 60 * 1000}`,
      10
    )
  };
};
