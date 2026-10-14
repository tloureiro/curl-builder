import {
  BodyFormField,
  ConcreteRequest,
  CurlOptions,
  Header,
  RequestBody,
  HttpMethod,
} from "./types";
import { generateId } from "./util";

interface ParsedCurl {
  request: ConcreteRequest;
  options: CurlOptions;
}

export function parseCurlCommand(input: string): ParsedCurl | null {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) return null;

  // drop leading curl binary token if present
  if (tokens[0].includes("curl")) {
    tokens.shift();
  }

  let method: HttpMethod = "GET";
  let url = "";
  const headers: Header[] = [];
  const formFields: BodyFormField[] = [];
  let rawData = "";
  let bodyMode: RequestBody["mode"] = "none";

  const options: CurlOptions = {
    includeHeaders: false,
    followRedirects: false,
    silentAndShowErrors: false,
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];

    switch (token) {
      case "--proto":
      case "--proto-redir":
        if (next) i++;
        break;
      case "--disable":
      case "--globoff":
      case "--":
        break;
      case "-X":
      case "--request":
        if (next) {
          method = next.toUpperCase() as HttpMethod;
          i++;
        }
        break;
      case "-H":
      case "--header":
        if (next) {
          const [name, ...rest] = next.split(":");
          headers.push({
            id: generateId(),
            name: name?.trim() ?? "",
            value: rest.join(":").trim(),
            enabled: true,
          });
          i++;
        }
        break;
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
        if (next !== undefined) {
          rawData = next;
          bodyMode = looksJson(rawData) ? "json" : "raw";
          i++;
        }
        break;
      case "-F":
      case "--form":
      case "--form-string":
        if (next) {
          const [name, ...rest] = next.split("=");
          formFields.push({
            id: generateId(),
            name: name ?? "",
            value: rest.join("=") ?? "",
            enabled: true,
          });
          bodyMode = "form";
          i++;
        }
        break;
      case "-I":
      case "--head":
        method = "HEAD";
        break;
      case "-L":
      case "--location":
        options.followRedirects = true;
        break;
      case "-i":
      case "--include":
        options.includeHeaders = true;
        break;
      case "-s":
        options.silentAndShowErrors = true;
        break;
      case "-S":
      case "--show-error":
        options.silentAndShowErrors = true;
        break;
      case "-sS":
        options.silentAndShowErrors = true;
        break;
      case "--max-time":
        if (next) {
          const seconds = Number(next);
          if (!Number.isNaN(seconds) && seconds > 0) {
            options.timeoutMs = seconds * 1000;
          }
          i++;
        }
        break;
      case "--resolve":
      case "--connect-to":
        // Argument is not the URL; skip it so we don't misread as the request URL.
        if (next) i++;
        break;
      default: {
        if (!token.startsWith("-")) {
          // treat as URL if we don't have one yet
          if (!url) url = token;
        }
        break;
      }
    }
  }

  const body: RequestBody = {
    mode: bodyMode,
    rawText: bodyMode === "form" ? "" : rawData,
    formFields,
  };

  const request: ConcreteRequest = {
    id: generateId(),
    method,
    url,
    headers,
    body,
    resolvedVariables: {},
    curlOptions: options,
  };

  return { request, options };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (inDouble) {
      if (ch === "\"") {
        inDouble = false;
      } else if (ch === "\\" && i + 1 < input.length) {
        i++;
        current += input[i];
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === "\"") {
      inDouble = true;
      continue;
    }
    if (ch === "\\" && i + 1 < input.length) {
      i++;
      current += input[i];
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function looksJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}
