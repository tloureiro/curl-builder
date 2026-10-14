import { ConcreteRequest, CurlOptions, RequestBody } from "./types";
import { escapeArgForShell } from "./util";

export function buildCurlArgs(req: ConcreteRequest, options?: CurlOptions): string[] {
  // Keep the copyable preview aligned with execution's single-transfer policy.
  // --disable must be first to suppress implicit user-level curl configuration.
  const args: string[] = ["--disable", "--globoff", "--proto", "=http,https", "--proto-redir", "=http,https"];
  const opts = options || req.curlOptions;

  if (opts?.silentAndShowErrors) {
    args.push("-sS");
  }
  if (opts?.includeHeaders) {
    args.push("-i");
  }
  if (opts?.followRedirects) {
    args.push("-L");
  }
  if (opts?.timeoutMs && opts.timeoutMs > 0) {
    args.push("--max-time", String(Math.ceil(opts.timeoutMs / 1000)));
  }

  const upperMethod = req.method.toUpperCase();
  if (upperMethod !== "GET") {
    args.push("-X", upperMethod);
  }

  for (const header of req.headers) {
    if (!header.enabled || !header.name) continue;
    args.push("-H", `${header.name}: ${header.value}`);
  }

  appendBody(args, req.body);

  if (opts?.extraArgs?.length) {
    args.push(...opts.extraArgs);
  }

  args.push("--", req.url);

  return args;
}

function appendBody(args: string[], body: RequestBody) {
  if (body.mode === "json" && body.rawText.trim()) {
    args.push("-H", "Content-Type: application/json");
    args.push("--data-raw", body.rawText);
  } else if (body.mode === "raw" && body.rawText.trim()) {
    args.push("--data-raw", body.rawText);
  } else if (body.mode === "form" && body.formFields.length > 0) {
    for (const field of body.formFields) {
      if (!field.enabled || !field.name) continue;
      args.push("--form-string", `${field.name}=${field.value}`);
    }
  }
}

export function buildCurlCommandString(
  curlPath: string,
  args: string[],
  multiline = false
): string {
  if (!multiline) {
    return [curlPath, ...args.map(escapeArgForShell)].join(" ");
  }
  const parts = [escapeArgForShell(curlPath), ...args.map(escapeArgForShell)];
  return parts.join(" \\\n");
}
