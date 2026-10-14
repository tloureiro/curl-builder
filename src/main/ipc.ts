import { ipcMain, IpcMainInvokeEvent } from "electron";
import { assertConfig, assertExecution, assertGrep, assertJq, assertTemplates, assertProcessId, InputError } from "../shared/validation";
import { detectBinaries } from "./binaries";
import { executeCurl } from "./executeCurl";
import { executeGrep } from "./executeGrep";
import { executeJq } from "./executeJq";
import { getConfig, initConfig, updateConfig } from "./configManager";
import { loadTemplates, saveTemplates } from "./storage";
import { killProcess } from "./processRegistry";
import { writeRunLog } from "./runLog";
import { ExecutionRequest, GrepExecutionRequest, JqExecutionRequest, WorkspaceConfig } from "../shared/types";

export function registerIpcHandlers(trusted: (event: IpcMainInvokeEvent) => boolean) {
  const handle = (channel: string, operation: (value: any) => unknown) => {
    ipcMain.handle(channel, async (event, value) => {
      if (!trusted(event)) throw new InputError("This frame cannot use application commands");
      try { return await operation(value); }
      catch (error) {
        if (error instanceof InputError) throw error;
        throw new Error("Application operation failed. Check the request or local data settings.");
      }
    });
  };
  handle("run-curl", async (req: ExecutionRequest) => {
    assertExecution(req);
    return await executeCurl(req);
  });

  handle("run-jq", async (req: JqExecutionRequest) => {
    assertJq(req);
    return await executeJq(req);
  });

  handle("run-grep", async (req: GrepExecutionRequest) => {
    assertGrep(req);
    return await executeGrep(req);
  });

  handle("detect-binaries", async () => {
    return await detectBinaries();
  });

  handle("save-workspace-config", async (cfg: WorkspaceConfig) => {
    assertConfig(cfg);
    await updateConfig(cfg);
  });

  handle("load-workspace-config", async () => {
    try {
      await initConfig();
      return getConfig();
    } catch {
      // Electron logs rejected IPC errors; omit parser text and saved values.
      throw new InputError("Could not read workspace settings. Check config.json and the data directory.");
    }
  });

  handle("load-templates", async () => {
    try {
      return await loadTemplates();
    } catch {
      throw new InputError("Could not read templates. Check templates.json and the data directory.");
    }
  });

  handle("save-templates", async (templates) => {
    assertTemplates(templates);
    await saveTemplates(templates);
  });

  handle("kill-process", async (processId: string) => {
    assertProcessId(processId);
    return killProcess(processId);
  });

  handle("write-run-log", async (content: string) => {
    return writeRunLog(content ?? "");
  });
}
