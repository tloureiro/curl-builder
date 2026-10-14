// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeCurl } from "../src/main/executeCurl";
import { executeJq } from "../src/main/executeJq";
import { ConcreteRequest } from "../src/shared/types";

let server: http.Server;
let baseUrl: string;
let postCount = 0;
let receivedBody = "";
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
    receivedBody = body;
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/json" });
      res.end();
      return;
    }
    if (req.method === "POST") postCount++;
    res.writeHead(200, { "Content-Type": "application/json", "X-Test": "synthetic" });
    res.end('{"value":"synthetic"}');
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
});
afterAll(async () => {
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
});

function request(url = "/json"): ConcreteRequest {
  return { id: "test", method: "GET", url: baseUrl + url, headers: [],
    body: { mode: "none", rawText: "", formFields: [] }, resolvedVariables: {},
    curlOptions: { includeHeaders: true, followRedirects: false, silentAndShowErrors: true,
      timeoutMs: 2000, extraArgs: ["--noproxy", "*"] } };
}

describe("response capture from one local request", () => {
  it("sends @-prefixed bodies as literal text, not local-file content", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "curl-builder-literal-test-"));
    try {
      const file = path.join(dir, "sample.txt");
      await fs.writeFile(file, "synthetic-do-not-read");
      const req = request(); req.method = "POST";
      req.body = { mode: "raw", rawText: "@" + file, formFields: [] };
      expect((await executeCurl({ request: req })).exitCode).toBe(0);
      expect(receivedBody).toBe("@" + file);
      req.body = { mode: "form", rawText: "", formFields: [{ id: "field", name: "sample", value: "@" + file, enabled: true }] };
      expect((await executeCurl({ request: req })).exitCode).toBe(0);
      expect(receivedBody).toContain("@" + file);
      expect(receivedBody).not.toContain("synthetic-do-not-read");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
  it("rejects local-file transfers and output options before executing", async () => {
    await expect(executeCurl({ request: { ...request(), url: "file:///tmp/private" } })).rejects.toThrow();
    const req = request(); req.curlOptions!.extraArgs = ["--output", "/tmp/do-not-write"];
    await expect(executeCurl({ request: req })).rejects.toThrow();
  });
  it("keeps -i headers available and gives jq only JSON", async () => {
    const response = await executeCurl({ request: request() });
    expect(response.exitCode).toBe(0);
    expect(response.stdout).toContain("X-Test: synthetic");
    expect(response.responseBody).toBe('{"value":"synthetic"}');
    const jq = await executeJq({ expr: ".value", jsonInput: response.responseBody! });
    expect(jq).toMatchObject({ stdout: '"synthetic"\n', exitCode: 0 });
  });

  it("separates redirect headers from the final body", async () => {
    const req = request("/redirect");
    req.curlOptions!.followRedirects = true;
    const response = await executeCurl({ request: req });
    expect(response.responseHeaders).toContain("302");
    expect(response.responseHeaders).toContain("200");
    expect(response.responseBody).toBe('{"value":"synthetic"}');
  });

  it("honors headers off even when extra flags include -i", async () => {
    const req = request();
    req.curlOptions!.includeHeaders = false;
    req.curlOptions!.extraArgs!.push("-i");
    const response = await executeCurl({ request: req });
    expect(response.stdout).toBe(response.responseBody);
    expect(response.responseHeaders).toContain("200");
  });

  it("captures a POST response with one side effect", async () => {
    const before = postCount;
    const req = request();
    req.method = "POST";
    req.body = { mode: "json", rawText: '{"sample":true}', formFields: [] };
    const response = await executeCurl({ request: req });
    expect(response.exitCode).toBe(0);
    expect(response.responseBody).toBe('{"value":"synthetic"}');
    expect(postCount - before).toBe(1);
  });
});
