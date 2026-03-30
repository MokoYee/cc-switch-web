import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openDatabase } from "../../db/database.js";
import { SettingsRepository } from "./settings-repository.js";

test("reports database control token runtime view with masking and rotation support", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "cc-switch-web-settings-"));
  const database = openDatabase(join(dataDir, "test.sqlite"));
  const repository = new SettingsRepository(database);

  const token = repository.getControlToken(null);
  const runtime = repository.getControlTokenRuntimeView(null);

  assert.equal(runtime.source, "database");
  assert.equal(runtime.canRotate, true);
  assert.equal(runtime.updatedAt !== null, true);
  assert.notEqual(runtime.maskedToken, token.value);
  assert.equal(runtime.maskedToken.startsWith(token.value.slice(0, 6)), true);

  database.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("reports env control token runtime view and blocks rotation", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "cc-switch-web-settings-"));
  const database = openDatabase(join(dataDir, "test.sqlite"));
  const repository = new SettingsRepository(database);

  const runtime = repository.getControlTokenRuntimeView("env-override-token");

  assert.equal(runtime.source, "env");
  assert.equal(runtime.canRotate, false);
  assert.equal(runtime.updatedAt, null);
  assert.equal(runtime.maskedToken.includes("..."), true);
  assert.throws(() => repository.rotateControlToken("env-override-token"));

  database.close();
  rmSync(dataDir, { recursive: true, force: true });
});
