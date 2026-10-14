// Runtime contracts for IPC and saved JSON. Errors name the contract, never values.
import { ConcreteRequest, ExecutionRequest, GrepExecutionRequest, JqExecutionRequest,
  RequestTemplate, WorkspaceConfig } from "./types";

export class InputError extends Error {}

type RecordValue = Record<string, unknown>;
function check(ok: unknown): asserts ok { if (!ok) throw new InputError("Invalid application data"); }
function size(value: unknown, max = 8 * 1024 * 1024) {
  try { check(new TextEncoder().encode(JSON.stringify(value)).length <= max); }
  catch { throw new InputError("Application data exceeds the supported size or shape"); }
}
function object(value: unknown, keys: string[]): RecordValue {
  check(value !== null && typeof value === "object" && !Array.isArray(value));
  const data = value as RecordValue;
  check(Object.keys(data).every((key) => keys.includes(key)));
  return data;
}
function text(value: unknown, max = 65536): asserts value is string {
  check(typeof value === "string" && value.length <= max && !value.includes("\0"));
}
function optionalText(value: unknown, max?: number) { if (value !== undefined) text(value, max); }
function bool(value: unknown) { if (value !== undefined) check(typeof value === "boolean"); }
function timeout(value: unknown) { if (value !== undefined) check(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 3600000); }
function list(value: unknown, visit: (item: unknown) => void, max = 1000) {
  check(Array.isArray(value) && value.length <= max); value.forEach(visit);
}
function strings(value: unknown) { list(value, (item) => text(item)); }
function options(value: unknown) {
  if (value === undefined) return;
  const d = object(value, ["includeHeaders", "followRedirects", "silentAndShowErrors", "timeoutMs", "extraArgs"]);
  [d.includeHeaders, d.followRedirects, d.silentAndShowErrors].forEach(bool);
  timeout(d.timeoutMs); if (d.extraArgs !== undefined) strings(d.extraArgs);
}
function grepOptions(value: unknown) {
  if (value === undefined) return;
  const d = object(value, ["caseInsensitive", "wordMatch", "fixedStrings", "invertMatch"]);
  Object.values(d).forEach(bool);
}
function header(value: unknown) {
  const d = object(value, ["id", "name", "value", "enabled"]);
  text(d.id, 128); text(d.name, 256); text(d.value); check(typeof d.enabled === "boolean");
  if (d.enabled && d.name) check(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(d.name) && !/[\r\n]/.test(d.value));
}
function body(value: unknown) {
  const d = object(value, ["mode", "rawText", "formFields"]);
  check(["none", "raw", "json", "form"].includes(d.mode as string)); text(d.rawText, 1024 * 1024);
  list(d.formFields, (item) => {
    const f = object(item, ["id", "name", "value", "enabled"]);
    text(f.id, 128); text(f.name, 256); text(f.value, 1024 * 1024); check(typeof f.enabled === "boolean");
    check(!/[=\r\n]/.test(f.name));
  });
}
function common(d: RecordValue) {
  options(d.curlOptions); grepOptions(d.grepOptions); bool(d.useRipgrep);
  optionalText(d.jqExpression); [d.grepPatterns, d.grepFlags].forEach((v) => { if (v !== undefined) strings(v); });
  if (d.cookies !== undefined) list(d.cookies, (item) => {
    const c = object(item, ["id", "name", "value", "path", "domain", "sameSite", "secure", "httpOnly", "enabled"]);
    text(c.id, 128); text(c.name, 256); text(c.value); check(typeof c.enabled === "boolean");
    [c.path, c.domain, c.sameSite].forEach((v) => optionalText(v)); [c.secure, c.httpOnly].forEach(bool);
  });
}
const commonKeys = ["curlOptions", "jqExpression", "grepPatterns", "grepFlags", "grepOptions", "useRipgrep", "cookies"];

export function assertRequest(value: unknown): asserts value is ConcreteRequest {
  size(value);
  const d = object(value, ["id", "templateId", "method", "url", "headers", "body", "resolvedVariables", "globalOptionIds", ...commonKeys]);
  text(d.id, 128); optionalText(d.templateId, 128);
  check(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(d.method as string));
  text(d.url, 16384); list(d.headers, header); body(d.body); common(d);
  check(d.resolvedVariables !== null && typeof d.resolvedVariables === "object" && !Array.isArray(d.resolvedVariables));
  check(Object.entries(d.resolvedVariables as RecordValue).every(([key, v]) => /^[A-Za-z0-9_]+$/.test(key) && !["__proto__", "constructor", "prototype"].includes(key) && typeof v === "string" && v.length <= 65536));
  if (d.globalOptionIds !== undefined) strings(d.globalOptionIds);
}

export function assertTemplates(value: unknown): asserts value is RequestTemplate[] {
  size(value);
  list(value, (item) => {
    const d = object(item, ["id", "name", "description", "method", "urlTemplate", "headersTemplate", "bodyTemplate", "variablesMeta", ...commonKeys]);
    text(d.id, 128); text(d.name, 256); optionalText(d.description);
    assertRequest({ id: d.id, method: d.method, url: d.urlTemplate, headers: d.headersTemplate, body: d.bodyTemplate, resolvedVariables: {},
      ...Object.fromEntries(commonKeys.filter((k) => d[k] !== undefined).map((k) => [k, d[k]])) });
    if (d.variablesMeta !== undefined) list(d.variablesMeta, (item) => {
      const m = object(item, ["name", "description", "defaultValue", "required"]);
      text(m.name, 128); optionalText(m.description); optionalText(m.defaultValue); bool(m.required);
    });
  }, 500);
}

export function assertBinary(value: unknown, names: string[]): asserts value is string {
  text(value, 4096);
  const name = value.split(/[\\/]/).pop()!.toLowerCase().replace(/\.exe$/, "");
  check(names.includes(name) && (value === name || value.toLowerCase() === name + ".exe" || /^(\/|[A-Za-z]:[\\/])/.test(value)));
}
export function assertConfig(value: unknown): asserts value is WorkspaceConfig {
  size(value);
  const d = object(value, ["curlPath", "jqPath", "grepPath", "defaultTimeoutMs", "defaultCurlFlags", "shortcuts", "globalCurlOptions"]);
  assertBinary(d.curlPath, ["curl"]);
  if (d.jqPath !== undefined) assertBinary(d.jqPath, ["jq"]);
  if (d.grepPath !== undefined) assertBinary(d.grepPath, ["grep", "rg"]);
  check(typeof d.defaultTimeoutMs === "number");
  timeout(d.defaultTimeoutMs);
  const flags = object(d.defaultCurlFlags, ["includeHeaders", "followRedirects", "silentAndShowErrors"]);
  check([flags.includeHeaders, flags.followRedirects, flags.silentAndShowErrors].every((flag) => typeof flag === "boolean"));
  const s = object(d.shortcuts, ["runRequest", "runTemplate"]); text(s.runRequest, 128); text(s.runTemplate, 128);
  list(d.globalCurlOptions, (item) => {
    const g = object(item, ["id", "label", "argsText"]); text(g.id, 128); text(g.label, 256); text(g.argsText);
  }, 100);
}
export function assertExecution(value: unknown): asserts value is ExecutionRequest {
  size(value);
  const d = object(value, ["request", "extraCurlArgs", "executionId"]); assertRequest(d.request);
  if (d.extraCurlArgs !== undefined) strings(d.extraCurlArgs); optionalText(d.executionId, 128);
}
export function assertJq(value: unknown): asserts value is JqExecutionRequest {
  size(value, 12 * 1024 * 1024);
  const d = object(value, ["expr", "jsonInput", "timeoutMs"]); text(d.expr); text(d.jsonInput, 10 * 1024 * 1024); timeout(d.timeoutMs);
}
export function assertGrep(value: unknown): asserts value is GrepExecutionRequest {
  size(value, 12 * 1024 * 1024);
  const d = object(value, ["pattern", "patterns", "inputText", "useRipgrep", "flags", "options", "timeoutMs"]);
  optionalText(d.pattern); if (d.patterns !== undefined) strings(d.patterns);
  if (d.flags !== undefined) strings(d.flags); text(d.inputText, 10 * 1024 * 1024); bool(d.useRipgrep); grepOptions(d.options); timeout(d.timeoutMs);
}
export function assertProcessId(value: unknown): asserts value is string { text(value, 128); check(/^[A-Za-z0-9_-]+$/.test(value)); }
