import { buildCurlArgs, buildCurlCommandString } from "../shared/curlArgsBuilder";
import { ExecutionRequest, ExecutionResult } from "../shared/types";
import { assertRequest, InputError } from "../shared/validation";
import { assertCurlArgs, assertHttpURL } from "../shared/cliPolicy";
import { generateId } from "../shared/util";
import { getConfig } from "./configManager";
import { runProcess } from "./runProcess";
import { finishProcess, registerProcess } from "./processRegistry";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export async function executeCurl(execReq: ExecutionRequest): Promise<ExecutionResult> {
  assertRequest(execReq.request);
  assertHttpURL(execReq.request.url);
  assertCurlArgs([...(execReq.request.curlOptions?.extraArgs ?? []), ...(execReq.extraCurlArgs ?? [])]);
  const id = execReq.executionId || generateId();
  const { request, extraCurlArgs = [] } = execReq;
  const config = getConfig();
  const curlPath = config.curlPath || "curl";

  const timeoutMs = request.curlOptions?.timeoutMs;

  const flags = {
    includeHeaders: request.curlOptions?.includeHeaders ?? config.defaultCurlFlags.includeHeaders,
    followRedirects: request.curlOptions?.followRedirects ?? config.defaultCurlFlags.followRedirects,
    silentAndShowErrors:
      request.curlOptions?.silentAndShowErrors ?? config.defaultCurlFlags.silentAndShowErrors,
    timeoutMs: timeoutMs && timeoutMs > 0 ? timeoutMs : undefined,
    extraArgs: [...(request.curlOptions?.extraArgs ?? []), ...extraCurlArgs],
  };

  const args = buildCurlArgs({ ...request, curlOptions: flags }, flags);

  // Capture headers independently so jq always receives the body, including
  // with -i, redirects, interim responses, or proxy CONNECT headers.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "curl-builder-response-"));
  const headerPath = path.join(tempDir, "headers");
  // --disable must be first: do not load an implicit ~/.curlrc. Never interpret
  // URL globbing or redirects as permission for additional/local-file transfers.
  const captureArgs = [...args.slice(0, -2), "--no-include", "--dump-header", headerPath, "--", request.url];
  const startedAt = Date.now();
  try {
    const running = runProcess(curlPath, captureArgs, { timeoutMs: flags.timeoutMs });
    registerProcess(id, running.kill);
    const result = await running.promise;
    const headerSize = await fs.stat(headerPath).then((stat) => stat.size).catch((err) => {
      if (err.code === "ENOENT") return 0;
      throw err;
    });
    if (headerSize > 1024 * 1024) throw new InputError("Response headers exceeded capture limit");
    const responseHeaders = await fs.readFile(headerPath, "utf8").catch((err) => {
      if (err.code === "ENOENT") return "";
      throw err;
    });
    return {
      id,
      curlCommand: buildCurlCommandString(curlPath, args, false),
      startedAt,
      finishedAt: Date.now(),
      exitCode: result.exitCode,
      stdout: (flags.includeHeaders ? responseHeaders : "") + result.stdout,
      responseBody: result.stdout,
      responseHeaders,
      stderr: result.stderr,
      errorMessage: result.errorMessage,
    };
  } finally {
    finishProcess(id);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
