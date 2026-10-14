import { InputError } from "./validation";
// A single HTTP request and stdin-only filters. Unknown options fail closed.
const curlSwitches = new Set(["-sS", "-s", "-S", "--silent", "--show-error", "-i", "--include", "--no-include",
  "-L", "--location", "-I", "--head", "-k", "--insecure", "--compressed", "--http1.0", "--http1.1", "--http2",
  "--http2-prior-knowledge", "-4", "-6", "--ipv4", "--ipv6", "-f", "--fail", "--fail-with-body", "--fail-early",
  "--no-progress-meter", "-g", "--globoff", "--tcp-nodelay", "--no-keepalive", "--basic", "--digest", "--anyauth",
  "--proxy-basic", "--proxy-digest", "--proxy-anyauth", "--no-buffer"]);
const curlValues = new Set(["-H", "--header", "-u", "--user", "-x", "--proxy", "--noproxy", "--resolve", "--connect-to",
  "--connect-timeout", "--max-time", "-m", "--retry", "--retry-delay", "--retry-max-time", "--max-redirs", "-X", "--request",
  "--data-raw", "--data", "-d", "--data-binary", "--data-urlencode", "--form-string", "--cookie", "-b",
  "--user-agent", "-A", "--referer", "-e", "--oauth2-bearer", "--range", "-r", "--limit-rate"]);

export function assertHttpURL(value: string): void {
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && url.hostname && !/[\r\n\0]/.test(value)) return;
  } catch { /* Give no endpoint values to rejected IPC error logs. */ }
  throw new InputError("Use one HTTP or HTTPS request URL");
}
export function assertCurlArgs(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const raw = args[i];
    if (curlSwitches.has(raw)) continue;
    let flag = raw;
    let inline: string | undefined;
    if (raw.startsWith("--") && raw.includes("=")) {
      const split = raw.indexOf("="); flag = raw.slice(0, split); inline = raw.slice(split + 1);
    } else if (/^-[^-].+/.test(raw) && curlValues.has(raw.slice(0, 2))) {
      flag = raw.slice(0, 2); inline = raw.slice(2);
    }
    if (!curlValues.has(flag)) throw new InputError("Unsupported curl option: file access, additional URLs and output redirection are not supported");
    const value = inline ?? args[++i];
    if (typeof value !== "string" || value.includes("\0")) throw new InputError("Missing or invalid curl option value");
    if (["-H", "--header", "--data", "-d", "--data-binary"].includes(flag) && value.startsWith("@")) {
      throw new InputError("File-backed curl values are not supported; enter literal data");
    }
    if (["-H", "--header"].includes(flag) && /[\r\n]/.test(value)) throw new InputError("Header line breaks are not supported");
    if (["--cookie", "-b"].includes(flag) && !value.includes("=")) throw new InputError("Cookies must be literal name=value pairs");
    if (flag === "--data-urlencode" && value.includes("@") && (!value.includes("=") || value.indexOf("@") < value.indexOf("="))) {
      throw new InputError("File-backed curl values are not supported; enter literal data");
    }
  }
}

const grepSwitches = new Set(["-i", "-w", "-F", "-v", "-n", "-c", "-x", "-o", "-q", "-E", "-G", "-P",
  "--ignore-case", "--word-regexp", "--fixed-strings", "--invert-match", "--line-number", "--count", "--line-regexp",
  "--only-matching", "--quiet", "--extended-regexp", "--basic-regexp", "--perl-regexp", "--pcre2"]);
export function assertGrepFlags(flags: string[]): void {
  if (flags.some((flag) => !grepSwitches.has(flag))) throw new InputError("Unsupported filter option; only stdin matching options are supported");
}

export function assertJqExpression(expr: string): void {
  // Ignore ordinary string literals, retaining interpolated strings conservatively.
  // Module directives can read local .jq/.json files outside the supplied response.
  const code = expr.replace(/"(?:[^"\\]|\\(?!\().)*"/g, '""');
  if (/(^|[^A-Za-z0-9_.])(import|include|module)\b/.test(code)) {
    throw new InputError("jq module loading is not supported; filter the supplied response only");
  }
}
