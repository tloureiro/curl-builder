// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { configureStorage, getStoragePaths, loadWorkspaceConfig, saveWorkspaceConfig,
  loadTemplates, saveTemplates } from "../src/main/storage";
import { writeRunLog } from "../src/main/runLog";
import { defaultConfig } from "../src/main/defaults";

let temp: string;
beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "curl-builder-storage-test-"));
  configureStorage(path.join(temp, "data"));
});
afterEach(async () => { await fs.rm(temp, { recursive: true, force: true }); });

describe("isolated runtime storage", () => {
  it("uses defaults without reading a repo-root config", async () => {
    expect(await loadWorkspaceConfig()).toEqual(defaultConfig);
    expect(await loadTemplates()).toEqual([]);
    expect(getStoragePaths().configPath).toBe(path.join(temp, "data", "config.json"));
  });
  it("creates private runtime files in the configured directory", async () => {
    await saveWorkspaceConfig(defaultConfig);
    await saveTemplates([]);
    const logPath = writeRunLog("curl exit: 0 stdout=2B stderr=0B");
    expect(await fs.readdir(path.join(temp, "data"))).toEqual(["config.json", "run.log", "templates.json"]);
    expect(await fs.readFile(logPath, "utf8")).toContain("curl exit: 0");
    if (process.platform !== "win32") {
      expect((await fs.stat(logPath)).mode & 0o777).toBe(0o600);
      expect((await fs.stat(getStoragePaths().configPath)).mode & 0o777).toBe(0o600);
    }
  });
  it("rejects relative storage paths", () => {
    expect(() => configureStorage("relative")).toThrow("must be absolute");
  });
  it("refuses oversized saved files before reading them and leaves them intact", async () => {
    await fs.mkdir(path.join(temp, "data"));
    const file = getStoragePaths().templatesPath;
    await fs.writeFile(file, "");
    await fs.truncate(file, 8 * 1024 * 1024 + 1);
    await expect(loadTemplates()).rejects.toThrow("supported size");
    expect((await fs.stat(file)).size).toBe(8 * 1024 * 1024 + 1);
  });
  it("rejects invalid replacements without changing the saved file", async () => {
    await saveWorkspaceConfig(defaultConfig);
    const original = await fs.readFile(getStoragePaths().configPath, "utf8");
    await expect(saveWorkspaceConfig({ ...defaultConfig, jqPath: "/bin/sh" })).rejects.toThrow();
    expect(await fs.readFile(getStoragePaths().configPath, "utf8")).toBe(original);
    expect(await fs.readdir(path.join(temp, "data"))).toEqual(["config.json"]);
  });
  it("replaces existing public-mode files with private atomic writes", async () => {
    await saveWorkspaceConfig(defaultConfig);
    const file = getStoragePaths().configPath;
    await fs.chmod(file, 0o644);
    await saveWorkspaceConfig({ ...defaultConfig, defaultTimeoutMs: 1000 });
    const log = writeRunLog("Method: GET");
    await fs.chmod(log, 0o644);
    writeRunLog("Method: POST");
    expect((await loadWorkspaceConfig()).defaultTimeoutMs).toBe(1000);
    expect(await fs.readFile(log, "utf8")).toBe("Method: POST");
    expect(await fs.readdir(path.join(temp, "data"))).toEqual(["config.json", "run.log"]);
    if (process.platform !== "win32") {
      expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
      expect((await fs.stat(log)).mode & 0o777).toBe(0o600);
    }
  });
});
