export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface Header {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
}

export type BodyMode = "none" | "json" | "raw" | "form";

export interface BodyFormField {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
}

export interface CookieItem {
  id: string;
  name: string;
  value: string;
  path?: string;
  domain?: string;
  sameSite?: "Lax" | "Strict" | "None" | "";
  secure?: boolean;
  httpOnly?: boolean;
  enabled: boolean;
}

export interface RequestBody {
  mode: BodyMode;
  rawText: string;
  formFields: BodyFormField[];
}

export interface RequestTemplate {
  id: string;
  name: string;
  description?: string;
  method: HttpMethod;
  urlTemplate: string;
  headersTemplate: Header[];
  bodyTemplate: RequestBody;
  variablesMeta?: VariableMeta[];
  curlOptions?: CurlOptions;
  cookies?: CookieItem[];
  jqExpression?: string;
  grepPatterns?: string[];
  grepFlags?: string[];
  grepOptions?: GrepOptions;
  useRipgrep?: boolean;
}

export interface VariableMeta {
  name: string;
  description?: string;
  defaultValue?: string;
  required?: boolean;
}

export interface ConcreteRequest {
  id: string;
  templateId?: string;
  method: HttpMethod;
  url: string;
  headers: Header[];
  body: RequestBody;
  resolvedVariables: Record<string, string>;
  curlOptions?: CurlOptions;
  jqExpression?: string;
  grepPatterns?: string[];
  grepFlags?: string[];
  grepOptions?: GrepOptions;
  useRipgrep?: boolean;
  cookies?: CookieItem[];
  globalOptionIds?: string[];
}

export interface GlobalCurlOption {
  id: string;
  label: string;
  argsText: string;
}

export interface CurlOptions {
  includeHeaders: boolean; // -i
  followRedirects: boolean; // -L
  silentAndShowErrors: boolean; // -sS
  timeoutMs?: number;
  extraArgs?: string[];
}

export interface ExecutionRequest {
  request: ConcreteRequest;
  extraCurlArgs?: string[];
  executionId?: string;
}

export interface ExecutionResult {
  id: string;
  curlCommand: string;
  startedAt: number;
  finishedAt: number;
  exitCode: number | null;
  stdout: string;
  responseBody?: string;
  responseHeaders?: string;
  stderr: string;
  errorMessage?: string;
}

export interface JqExecutionRequest {
  expr: string;
  jsonInput: string;
  timeoutMs?: number;
}

export interface JqExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  errorMessage?: string;
}

export interface GrepExecutionRequest {
  pattern?: string; // legacy single pattern
  patterns?: string[];
  inputText: string;
  useRipgrep?: boolean;
  timeoutMs?: number;
  flags?: string[];
  options?: GrepOptions;
}

export interface GrepExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  errorMessage?: string;
}

export interface GrepOptions {
  caseInsensitive?: boolean;
  wordMatch?: boolean;
  fixedStrings?: boolean;
  invertMatch?: boolean;
}

export interface WorkspaceConfig {
  curlPath: string;
  jqPath?: string;
  grepPath?: string; // or rg
  defaultTimeoutMs: number;
  defaultCurlFlags: {
    includeHeaders: boolean;
    followRedirects: boolean;
    silentAndShowErrors: boolean;
  };
  shortcuts: {
    runRequest: string;
    runTemplate: string;
  };
  globalCurlOptions: GlobalCurlOption[];
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  request: ConcreteRequest;
}
