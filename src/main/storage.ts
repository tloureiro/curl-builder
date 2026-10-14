import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RequestTemplate, WorkspaceConfig } from "../shared/types";
import { assertConfig, assertTemplates, InputError } from "../shared/validation";
import { defaultConfig } from "./defaults";

let storageDirectory: string | undefined;

export function configureStorage(directory: string): void {
  if (!path.isAbsolute(directory)) throw new Error("Storage directory must be absolute");
  storageDirectory = directory;
}

export function getStoragePaths() {
  if (!storageDirectory) throw new Error("Storage has not been initialized");
  return {
    configPath: path.join(storageDirectory, "config.json"),
    templatesPath: path.join(storageDirectory, "templates.json"),
    logPath: path.join(storageDirectory, "run.log"),
  };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    if ((await fs.stat(filePath)).size > 8 * 1024 * 1024) throw new InputError("Saved file exceeds the supported size");
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function loadWorkspaceConfig(): Promise<WorkspaceConfig> {
  const stored = await readJsonFile<WorkspaceConfig>(getStoragePaths().configPath, defaultConfig);
  const merged = {
    ...defaultConfig,
    ...stored,
    defaultCurlFlags: {
      ...defaultConfig.defaultCurlFlags,
      ...stored.defaultCurlFlags,
    },
    shortcuts: {
      ...defaultConfig.shortcuts,
      ...stored.shortcuts,
    },
    globalCurlOptions: stored.globalCurlOptions ?? defaultConfig.globalCurlOptions,
  };
  assertConfig(merged);
  return merged;
}

export async function saveWorkspaceConfig(cfg: WorkspaceConfig): Promise<void> {
  assertConfig(cfg);
  await writeJsonFile(getStoragePaths().configPath, cfg);
}

export async function loadTemplates(): Promise<RequestTemplate[]> {
  const templates = await readJsonFile<RequestTemplate[]>(getStoragePaths().templatesPath, []);
  assertTemplates(templates);
  return templates;
}

export async function saveTemplates(templates: RequestTemplate[]): Promise<void> {
  assertTemplates(templates);
  await writeJsonFile(getStoragePaths().templatesPath, templates);
}
