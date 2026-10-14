import { execFile } from "node:child_process";
import { WorkspaceConfig } from "../shared/types";
import { defaultConfig } from "./defaults";

function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("which", [cmd], (err, stdout) => {
      if (err) return resolve(null);
      const path = stdout.trim();
      resolve(path || null);
    });
  });
}

export async function detectBinaries(): Promise<WorkspaceConfig> {
  const [curlPath, jqPath, rgPath, grepPath] = await Promise.all([
    which("curl"),
    which("jq"),
    which("rg"),
    which("grep"),
  ]);

  const chosenGrep = grepPath || rgPath;

  return {
    ...defaultConfig,
    curlPath: curlPath || defaultConfig.curlPath,
    jqPath: jqPath || defaultConfig.jqPath,
    grepPath: chosenGrep || defaultConfig.grepPath,
  };
}
