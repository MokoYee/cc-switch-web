import { defineConfig } from "@playwright/test";

const daemonHost = process.env.PLAYWRIGHT_DAEMON_HOST ?? "127.0.0.1";
const daemonPort = Number.parseInt(process.env.PLAYWRIGHT_DAEMON_PORT ?? "18911", 10);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${daemonHost}:${daemonPort}`;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 120_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: "node tools/browser/start-playwright-daemon.mjs",
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PLAYWRIGHT_DAEMON_HOST: daemonHost,
      PLAYWRIGHT_DAEMON_PORT: String(daemonPort),
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_CONTROL_TOKEN:
        process.env.PLAYWRIGHT_CONTROL_TOKEN ?? "playwright-control-token"
    }
  }
});
