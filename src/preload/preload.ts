import { contextBridge, ipcRenderer } from "electron";
import {
  ExecutionRequest,
  ExecutionResult,
  GrepExecutionRequest,
  GrepExecutionResult,
  JqExecutionRequest,
  JqExecutionResult,
  RequestTemplate,
  WorkspaceConfig,
} from "../shared/types";

const api = {
  runCurl: (req: ExecutionRequest): Promise<ExecutionResult> => ipcRenderer.invoke("run-curl", req),
  runJq: (req: JqExecutionRequest): Promise<JqExecutionResult> => ipcRenderer.invoke("run-jq", req),
  runGrep: (req: GrepExecutionRequest): Promise<GrepExecutionResult> =>
    ipcRenderer.invoke("run-grep", req),
  detectBinaries: (): Promise<WorkspaceConfig> => ipcRenderer.invoke("detect-binaries"),
  saveWorkspaceConfig: (cfg: WorkspaceConfig): Promise<void> =>
    ipcRenderer.invoke("save-workspace-config", cfg),
  loadWorkspaceConfig: (): Promise<WorkspaceConfig> => ipcRenderer.invoke("load-workspace-config"),
  loadTemplates: (): Promise<RequestTemplate[]> => ipcRenderer.invoke("load-templates"),
  saveTemplates: (templates: RequestTemplate[]): Promise<void> =>
    ipcRenderer.invoke("save-templates", templates),
  killProcess: (processId: string): Promise<boolean> => ipcRenderer.invoke("kill-process", processId),
  writeRunLog: (content: string): Promise<string> => ipcRenderer.invoke("write-run-log", content),
};

contextBridge.exposeInMainWorld("shell", api);

export type PreloadApi = typeof api;

declare global {
  interface Window {
    shell: PreloadApi;
  }
}
