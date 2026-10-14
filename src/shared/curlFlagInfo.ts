const FLAG_DESCRIPTIONS: Record<string, string> = {
  "--disable": "Ignore implicit curl configuration so execution follows the visible command.",
  "--globoff": "Treat URL brackets and braces literally instead of expanding multiple transfers.",
  "--proto": "Restrict the protocols permitted for this request.",
  "--proto-redir": "Restrict the protocols permitted when following redirects.",
  "-I": "Fetch response headers only and skip the body (HEAD request).",
  "-i": "Include response headers in the output before the body.",
  "-L": "Follow HTTP redirects (location headers).",
  "-s": "Silent mode (no progress bar, errors still printed unless -S).",
  "-S": "When used with -s, still show errors if they occur.",
  "-sS": "Silent output but still print errors (shorthand for -s -S).",
  "-H": "Add or override a header (e.g. -H \"Key: value\").",
  "--header": "Add or override a header (alias for -H).",
  "--resolve": "Manually map a host:port to an IP address (SNI/DNS override).",
  "-d": "Send data in the request body (implies POST unless -X overrides).",
  "--data": "Send data in the request body (implies POST unless -X overrides).",
  "--data-raw": "Send data exactly as provided without stripping newlines.",
  "--data-binary": "Send binary-safe body data without extra processing.",
  "--data-urlencode": "URL-encode data before sending (name=value style).",
  "-F": "Submit a multipart/form-data field (for file uploads/forms).",
  "--form": "Submit a multipart/form-data field (alias for -F).",
  "-X": "Explicitly set the HTTP request method (e.g. -X PUT).",
  "--request": "Explicitly set the HTTP request method (alias for -X).",
  "--max-time": "Maximum allowed time for the entire request in seconds.",
  "-u": "Provide user:password for server authentication.",
  "--user": "Provide user:password for server authentication (alias for -u).",
  "-b": "Send cookies from a string or file.",
  "--cookie": "Send cookies from a string or file (alias for -b).",
  "-k": "Allow insecure TLS/SSL connections (skip certificate validation).",
  "--insecure": "Allow insecure TLS/SSL connections (alias for -k).",
  "--compressed": "Request a compressed response and decompress it automatically.",
  "--proxy": "Use an HTTP/HTTPS proxy at the given host[:port].",
  "-x": "Use an HTTP/HTTPS proxy at the given host[:port] (alias for --proxy).",
};

export function getCurlFlagDescription(flag: string): string | undefined {
  const trimmed = flag.trim();
  if (!trimmed) return undefined;
  return FLAG_DESCRIPTIONS[trimmed] ?? FLAG_DESCRIPTIONS[trimmed.toLowerCase()];
}

export const knownCurlFlags = Object.keys(FLAG_DESCRIPTIONS);
