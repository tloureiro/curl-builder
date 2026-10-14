import { WorkspaceConfig } from "../shared/types";
import { defaultConfig } from "./defaults";
import { loadWorkspaceConfig, saveWorkspaceConfig } from "./storage";

let currentConfig: WorkspaceConfig = defaultConfig;

export async function initConfig() {
  currentConfig = await loadWorkspaceConfig();
}

export function getConfig(): WorkspaceConfig {
  return currentConfig;
}

export async function updateConfig(cfg: WorkspaceConfig) {
  await saveWorkspaceConfig(cfg);
  currentConfig = cfg;
}
