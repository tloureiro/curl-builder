import { describe, expect, it } from "vitest";
import { requestFromTemplate, templateFromRequest } from "../src/shared/templateUtils";
import { ConcreteRequest } from "../src/shared/types";

describe("template data", () => {
  it("retains the reusable request while omitting execution values and identifiers", () => {
    const request: ConcreteRequest = {
      id: "active", templateId: "old", method: "POST", url: "https://example.com/{{ITEM}}",
      headers: [{ id: "header", name: "X-{{NAME}}", value: "{{VALUE}}", enabled: true }],
      body: { mode: "form", rawText: "", formFields: [{ id: "field", name: "{{NAME}}", value: "{{VALUE}}", enabled: true }] },
      resolvedVariables: { VALUE: "synthetic-execution-secret" }, globalOptionIds: ["preset"],
      curlOptions: { includeHeaders: false, followRedirects: true, silentAndShowErrors: true,
        timeoutMs: 3000, extraArgs: ["--compressed", "--user", "{{AUTH}}"] },
      cookies: [{ id: "cookie", name: "sample", value: "{{COOKIE}}", enabled: true }],
      jqExpression: ".{{FIELD}}", grepPatterns: ["{{MATCH}}"], grepFlags: ["-n"],
      grepOptions: { fixedStrings: true }, useRipgrep: true,
    };
    const template = templateFromRequest(request, "Reusable");
    const restored = requestFromTemplate(JSON.parse(JSON.stringify(template)));
    const { globalOptionIds, ...expected } = request;
    expect(restored).toMatchObject({ ...expected, id: expect.any(String),
      templateId: template.id, resolvedVariables: {} });
    // Presets are already materialized in extraArgs; their UI IDs are not persisted.
    expect(restored).not.toHaveProperty("globalOptionIds");
    expect(JSON.stringify(template)).not.toContain("synthetic-execution-secret");
    request.headers[0].value = "edited";
    restored.curlOptions!.extraArgs!.push("changed");
    expect(template.headersTemplate[0].value).toBe("{{VALUE}}");
    expect(template.curlOptions!.extraArgs).not.toContain("changed");
  });

  it("opens older templates whose optional pipeline settings are absent", () => {
    const restored = requestFromTemplate({ id: "legacy", name: "Legacy", method: "GET",
      urlTemplate: "https://example.com/{{ITEM}}", headersTemplate: [],
      bodyTemplate: { mode: "none", rawText: "", formFields: [] } });
    expect(restored.url).toBe("https://example.com/{{ITEM}}");
    expect(restored.resolvedVariables).toEqual({});
    expect(restored.curlOptions).toBeUndefined();
  });
});
