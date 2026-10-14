// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runProcess } from "../src/main/runProcess";
import { executeGrep } from "../src/main/executeGrep";
import { pickGrepBinary } from "../src/shared/grepBinary";

describe("process stdin", () => {
  it.each(["", "synthetic input\n"])("closes supplied stdin: %j", async (input) => {
    const result = await runProcess(process.execPath, ["-e",
      "process.stdin.pipe(process.stdout)"], { stdinText: input, timeoutMs: 1000 }).promise;
    expect(result).toMatchObject({ stdout: input, exitCode: 0 });
    expect(result.errorMessage).toBeUndefined();
  });

  it("reports a missing executable", async () => {
    const result = await runProcess("/nonexistent/curl-builder-test", [], { stdinText: "" }).promise;
    expect(result.exitCode).toBeNull();
    expect(result.errorMessage).toBeTruthy();
  });
});

describe("filter binary selection", () => {
  it.each([
    ["grep", true, "rg"], ["/usr/bin/grep", true, "rg"],
    ["/usr/local/bin/rg", true, "/usr/local/bin/rg"],
    ["/tools/rg/grep", false, "/tools/rg/grep"], ["rg", false, "grep"],
    [undefined, false, "grep"], [undefined, true, "rg"],
  ])("selects %s with rg=%s", (configured, useRg, expected) => {
    expect(pickGrepBinary(configured, useRg)).toBe(expected);
  });

  it("finishes a real no-match grep over empty jq output", async () => {
    const result = await executeGrep({ patterns: ["match"], inputText: "", timeoutMs: 1000 });
    expect(result).toMatchObject({ stdout: "", stderr: "", exitCode: 1 });
    expect(result.errorMessage).toBeUndefined();
  });
});
