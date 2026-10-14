import { JqExecutionRequest, JqExecutionResult } from "../shared/types";
import { assertJq } from "../shared/validation";
import { assertJqExpression } from "../shared/cliPolicy";
import { getConfig } from "./configManager";
import { runProcess } from "./runProcess";

export async function executeJq(req: JqExecutionRequest): Promise<JqExecutionResult> {
  assertJq(req);
  assertJqExpression(req.expr);
  const config = getConfig();
  const jqPath = config.jqPath || "jq";
  const args = ["-c", "--", req.expr];

  const running = runProcess(jqPath, args, {
    stdinText: req.jsonInput,
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
