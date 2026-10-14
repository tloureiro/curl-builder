// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { assertCurlArgs, assertGrepFlags, assertHttpURL, assertJqExpression } from "../src/shared/cliPolicy";
import { assertConfig, assertExecution, assertTemplates } from "../src/shared/validation";
import { rendererURL, isRendererURL } from "../src/main/rendererPolicy";
import { defaultConfig } from "../src/main/defaults";
import { assertRunMetadata } from "../src/main/runLog";
import { runProcess, subprocessEnvironment } from "../src/main/runProcess";
import { buildCurlArgs } from "../src/shared/curlArgsBuilder";
import { parseCurlCommand } from "../src/shared/curlParser";
import { buildCurlCommandString } from "../src/shared/curlArgsBuilder";

describe("stdin/HTTP-only execution policy", () => {
  it("keeps protocol/config restrictions in a preview that parses back to the same request", () => {
    const req = { id: "sample", method: "POST" as const, url: "https://example.com/sample", headers: [],
      body: { mode: "raw" as const, rawText: "@literal", formFields: [] }, resolvedVariables: {} };
    const args = buildCurlArgs(req);
    expect(args[0]).toBe("--disable");
    expect(args.slice(-2)).toEqual(["--", req.url]);
    expect(parseCurlCommand(buildCurlCommandString("curl", args))?.request).toMatchObject({
      url: req.url, method: "POST", body: { mode: "raw", rawText: "@literal" },
    });
  });
  it.each([
    ["--output", "/tmp/private"], ["-o/tmp/private"], ["--config=/tmp/private"],
    ["-K/tmp/private"], ["--url", "https://example.com/second"], ["--next"],
    ["--data-binary", "@/tmp/private"], ["-H@/tmp/private"], ["--cookie", "/tmp/private"],
    ["--data-urlencode", "name@/tmp/private"], ["--proto", "+file"], ["https://example.com/second"],
  ])("rejects file/extra-transfer arguments %j", (...args) => {
    expect(() => assertCurlArgs(args)).toThrow();
  });
  it("accepts useful literal options without interpreting their values as flags", () => {
    expect(() => assertCurlArgs(["--compressed", "--resolve", "example.com:443:192.0.2.10",
      "-H", "X-Demo: literal", "--data-raw", "@literal", "--data-urlencode", "name=a@b", "-uuser:pass"])).not.toThrow();
  });
  it("restricts URLs and filter file options", () => {
    expect(() => assertHttpURL("file:///tmp/private")).toThrow();
    expect(() => assertHttpURL("ftp://example.com/file")).toThrow();
    expect(() => assertGrepFlags(["-f", "/tmp/private"])).toThrow();
    expect(() => assertGrepFlags(["--pre=sh"])).toThrow();
    expect(() => assertGrepFlags(["-F", "-i"])).not.toThrow();
  });
  it("blocks jq file modules but permits ordinary fields and literal words", () => {
    for (const expr of ['import "/tmp/private" as $data; $data', 'include"/tmp/private";', '"\\(import "/tmp/private" as $data; $data)"']) {
      expect(() => assertJqExpression(expr)).toThrow();
    }
    expect(() => assertJqExpression('.module, "include", .["import"]')).not.toThrow();
  });
});

describe("runtime payload contracts", () => {
  it("rejects binary overrides, invalid executables and malformed saved data", () => {
    expect(() => assertExecution({ request: {}, curlBinaryPath: "/bin/sh" })).toThrow();
    expect(() => assertConfig({ ...defaultConfig, jqPath: "/bin/sh" })).toThrow();
    expect(() => assertConfig({ ...defaultConfig, defaultTimeoutMs: Infinity })).toThrow();
    expect(() => assertConfig({ ...defaultConfig, jqPath: "/usr/local/bin/jq" })).not.toThrow();
    expect(() => assertTemplates([{ id: "bad", name: "bad" }])).toThrow();
    expect(() => assertTemplates({})).toThrow();
  });
  it("checks the exact renderer document instead of matching URL prefixes", () => {
    const expected = rendererURL("/tmp/app/index.html");
    expect(isRendererURL(expected + "#panel", expected)).toBe(true);
    expect(isRendererURL("file:///tmp/app/other.html", expected)).toBe(false);
    expect(isRendererURL("http://127.0.0.1:5173.evil.example/", "http://127.0.0.1:5173/")).toBe(false);
    expect(isRendererURL("http://127.0.0.1:5173/other", "http://127.0.0.1:5173/")).toBe(false);
    expect(() => rendererURL("/tmp/index.html", "https://example.com/")).toThrow();
  });
  it("refuses arbitrary text in the diagnostic log", () => {
    expect(() => assertRunMetadata("curl exit: 0 stdout=2B stderr=0B")).not.toThrow();
    expect(() => assertRunMetadata("Run @ 2026-10-14T20:00:00.000Z\nMethod: GET")).not.toThrow();
    expect(() => assertRunMetadata("Authorization: synthetic-secret")).toThrow();
    expect(() => assertRunMetadata("Method: GET\nsecret=synthetic-secret")).toThrow();
  });
});

describe("subprocess data limits", () => {
  it("does not inherit credentials, proxy values or SSL key-log paths", async () => {
    const source = { PATH: process.env.PATH, SYNTHETIC_SECRET: "do-not-inherit", HTTPS_PROXY: "do-not-inherit", SSLKEYLOGFILE: "/tmp/do-not-write" };
    expect(subprocessEnvironment(source)).toEqual({ PATH: process.env.PATH });
    const result = await runProcess(process.execPath, ["-e", "process.stdout.write(String(process.env.SYNTHETIC_SECRET))"], { env: source }).promise;
    expect(result.stdout).toBe("undefined");
  });
  it("terminates excessive output while keeping captured data bounded", async () => {
    const result = await runProcess(process.execPath, ["-e", "setInterval(() => process.stdout.write('x'.repeat(8192)), 1)"],
      { maxOutputBytes: 1024, timeoutMs: 2000 }).promise;
    expect(result.errorMessage).toBe("Process output exceeded capture limit");
    expect(result.stdout.length).toBeLessThanOrEqual(1024);
  });
});

const registrations = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<any>>());
vi.mock("electron", () => ({ ipcMain: { handle: (name: string, handler: any) => registrations.set(name, handler) } }));
import { registerIpcHandlers } from "../src/main/ipc";

describe("privileged IPC dispatch", () => {
  it("rejects every channel from an untrusted frame before performing work", async () => {
    registrations.clear(); registerIpcHandlers(() => false);
    for (const handler of registrations.values()) {
      await expect(handler({}, "synthetic-untrusted-payload")).rejects.toThrow("This frame cannot use application commands");
    }
    expect(registrations.size).toBe(10);
  });
  it("rejects malformed trusted payloads without echoing their values", async () => {
    registrations.clear(); registerIpcHandlers(() => true);
    await expect(registrations.get("run-jq")!({}, { expr: ".", jsonInput: "{}", jqBinaryPath: "synthetic-private-path" })).rejects.toThrow("Invalid application data");
    await expect(registrations.get("save-workspace-config")!({}, { ...defaultConfig, curlPath: "/bin/sh" })).rejects.toThrow("Invalid application data");
    await expect(registrations.get("write-run-log")!({}, "synthetic-secret")).rejects.toThrow("Diagnostic logs accept metadata only");
  });
});
