import { WorkspaceConfig } from "../shared/types";

export const defaultConfig: WorkspaceConfig = {
  curlPath: "curl",
  jqPath: "jq",
  grepPath: "grep",
  defaultTimeoutMs: 0,
  defaultCurlFlags: {
    includeHeaders: true,
    followRedirects: false,
    silentAndShowErrors: true,
  },
  shortcuts: {
    runRequest: "CtrlOrCmd+Enter",
    runTemplate: "CtrlOrCmd+Shift+T",
  },
  globalCurlOptions: [],
};
