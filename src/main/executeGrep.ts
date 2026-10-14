import { GrepExecutionRequest, GrepExecutionResult } from "../shared/types";
import { assertGrep } from "../shared/validation";
import { assertGrepFlags } from "../shared/cliPolicy";
import { getConfig } from "./configManager";
import { runProcess } from "./runProcess";
import { buildGrepArgs } from "../shared/grepArgsBuilder";
import { pickGrepBinary } from "../shared/grepBinary";

export async function executeGrep(req: GrepExecutionRequest): Promise<GrepExecutionResult> {
  assertGrep(req);
  assertGrepFlags(req.flags ?? []);
  const config = getConfig();
  const useRg = req.useRipgrep ?? false;
  const bin = pickGrepBinary(config.grepPath, useRg);

  const args = buildGrepArgs({ ...req, useRipgrep: useRg });

  const running = runProcess(bin, args, {
    stdinText: req.inputText,
    timeoutMs: Math.min(req.timeoutMs || config.defaultTimeoutMs || 30000, 60000),
  });

  const result = await running.promise;
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    errorMessage: result.errorMessage,
  };
}
