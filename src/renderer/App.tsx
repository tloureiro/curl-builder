import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "./Modal";
import {
  BodyFormField,
  ConcreteRequest,
  GlobalCurlOption,
  ExecutionResult,
  GrepExecutionResult,
  Header,
  HistoryEntry,
  HttpMethod,
  JqExecutionResult,
  RequestTemplate,
  WorkspaceConfig,
  CookieItem,
  RequestBody,
} from "../shared/types";
import { buildCurlArgs, buildCurlCommandString } from "../shared/curlArgsBuilder";
import { parseCurlCommand } from "../shared/curlParser";
import { requestFromTemplate, templateFromRequest, extractVars, substituteVars } from "../shared/templateUtils";
import { generateId } from "../shared/util";
import { buildGrepArgs } from "../shared/grepArgsBuilder";
import { pickGrepBinary } from "../shared/grepBinary";
import { escapeArgForShell } from "../shared/util";
import { getCurlFlagDescription } from "../shared/curlFlagInfo";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const FALLBACK_CONFIG: WorkspaceConfig = {
  curlPath: "curl",
  jqPath: "jq",
  grepPath: "grep",
  defaultTimeoutMs: 0,
  defaultCurlFlags: {
    includeHeaders: true,
    followRedirects: false,
    silentAndShowErrors: true,
  },
  shortcuts: {
    runRequest: "CtrlOrCmd+Enter",
    runTemplate: "CtrlOrCmd+Shift+T",
  },
  globalCurlOptions: [],
};

const createEmptyHeader = (): Header => ({
  id: generateId(),
  name: "",
  value: "",
  enabled: true,
});

const createEmptyCookie = (): CookieItem => ({
  id: generateId(),
  name: "",
  value: "",
  path: "",
  domain: "",
  sameSite: "",
  secure: false,
  httpOnly: false,
  enabled: true,
});

const createEmptyRequest = (): ConcreteRequest => ({
  id: generateId(),
  method: "GET",
  url: "https://httpbin.org/get",
  headers: [createEmptyHeader()],
  body: {
    mode: "none",
    rawText: "",
    formFields: [],
  },
  resolvedVariables: {},
  cookies: [],
  globalOptionIds: [],
});

const defaultShortcuts = {
  runRequest: "CtrlOrCmd+Enter",
  runTemplate: "CtrlOrCmd+Shift+T",
};

function normalizeRequest(req: ConcreteRequest): ConcreteRequest {
  return {
    ...req,
    headers: req.headers.length ? req.headers : [createEmptyHeader()],
    globalOptionIds: req.globalOptionIds ?? [],
    resolvedVariables: req.resolvedVariables ?? {},
  };
}

function collectVarsFromString(value: string | undefined, bucket: Set<string>) {
  if (!value || !value.includes("{{")) return;
  extractVars(value).forEach((v) => bucket.add(v));
}

function gatherRequestVariables(
  request: ConcreteRequest,
  cookieItems: CookieItem[],
  jqExpr: string,
  grepPatterns: string[],
  grepExtraFlags: string
): string[] {
  const vars = new Set<string>();
  collectVarsFromString(request.url, vars);
  request.headers.forEach((h) => {
    collectVarsFromString(h.name, vars);
    collectVarsFromString(h.value, vars);
  });
  if (request.body.rawText) {
    collectVarsFromString(request.body.rawText, vars);
  }
  request.body.formFields.forEach((f) => {
    collectVarsFromString(f.name, vars);
    collectVarsFromString(f.value, vars);
  });
  (request.curlOptions?.extraArgs ?? []).forEach((arg) => collectVarsFromString(arg, vars));
  cookieItems.forEach((c) => {
    collectVarsFromString(c.name, vars);
    collectVarsFromString(c.value, vars);
    collectVarsFromString(c.path, vars);
    collectVarsFromString(c.domain, vars);
  });
  collectVarsFromString(jqExpr, vars);
  grepPatterns.forEach((p) => collectVarsFromString(p, vars));
  collectVarsFromString(grepExtraFlags, vars);
  return Array.from(vars);
}

function resolveRequestWithVariables(
  request: ConcreteRequest,
  cookieItems: CookieItem[],
  vars: Record<string, string>
): { request: ConcreteRequest; cookies: CookieItem[] } {
  const replace = (value?: string) => {
    if (!value) return "";
    return substituteVars(value, vars);
  };
  const headers: Header[] = request.headers.map((h) => ({
    ...h,
    name: replace(h.name),
    value: replace(h.value),
  }));
  const formFields: BodyFormField[] = request.body.formFields.map((f) => ({
    ...f,
    name: replace(f.name),
    value: replace(f.value),
  }));
  const body: RequestBody = {
    ...request.body,
    rawText: replace(request.body.rawText),
    formFields,
  };
  const curlOptions = request.curlOptions
    ? {
        ...request.curlOptions,
        extraArgs: request.curlOptions.extraArgs?.map((arg) => replace(arg)) ?? undefined,
      }
    : undefined;
  const resolvedRequest: ConcreteRequest = {
    ...request,
    url: replace(request.url),
    headers,
    body,
    curlOptions,
    resolvedVariables: vars,
  };
  const resolvedCookies: CookieItem[] = cookieItems.map((c) => ({
    ...c,
    name: replace(c.name),
    value: replace(c.value),
    path: replace(c.path),
    domain: replace(c.domain),
  }));
  return { request: resolvedRequest, cookies: resolvedCookies };
}

type ResponseTab = "raw" | "json" | "jq" | "grep" | "stderr";

type FlagHint = {
  flag: string;
  description: string;
  x: number;
  y: number;
};

type VariablePromptState = {
  names: string[];
  values: Record<string, string>;
};

function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const modifiers = parts.slice(0, -1);
  const mainKey = parts[parts.length - 1];

  const needCtrl = modifiers.includes("ctrl") || modifiers.includes("control");
  const needCmd = modifiers.includes("cmd") || modifiers.includes("meta");
  const needCtrlOrCmd = modifiers.includes("ctrlorcmd");
  const needShift = modifiers.includes("shift");
  const needAlt = modifiers.includes("alt") || modifiers.includes("option");

  const ctrlOk = needCtrlOrCmd ? event.ctrlKey || event.metaKey : needCtrl ? event.ctrlKey : !event.ctrlKey;
  const cmdOk = needCtrlOrCmd ? event.ctrlKey || event.metaKey : needCmd ? event.metaKey : !event.metaKey;
  const shiftOk = needShift ? event.shiftKey : !event.shiftKey;
  const altOk = needAlt ? event.altKey : !event.altKey;

  const key = event.key.toLowerCase();
  const mainOk = key === mainKey.toLowerCase();

  return ctrlOk && cmdOk && shiftOk && altOk && mainOk;
}

function tokenizeSimple(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      else current += ch;
      continue;
    }
    if (inDouble) {
      if (ch === "\"") inDouble = false;
      else if (ch === "\\" && i + 1 < input.length) {
        i++;
        current += input[i];
      } else current += ch;
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
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function App() {
  const [config, setConfig] = useState<WorkspaceConfig>(FALLBACK_CONFIG);
  const [setupState, setSetupState] = useState<"loading" | "ready" | "failed" | "unavailable">("loading");
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [templates, setTemplates] = useState<RequestTemplate[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [request, setRequest] = useState<ConcreteRequest>(createEmptyRequest());
  const [response, setResponse] = useState<ExecutionResult | null>(null);
  const [jqResult, setJqResult] = useState<JqExecutionResult | null>(null);
  const [grepResult, setGrepResult] = useState<GrepExecutionResult | null>(null);
  const [finalOutput, setFinalOutput] = useState<string>("");
  const [finalStage, setFinalStage] = useState<"curl" | "jq" | "grep">("curl");
  const [cookies, setCookies] = useState<CookieItem[]>([createEmptyCookie()]);
  const [commandDirty, setCommandDirty] = useState<boolean>(false);
  const [resultTab, setResultTab] = useState<"chain" | "raw">("chain");
  const [rawResult, setRawResult] = useState<ExecutionResult | null>(null);
  const [jqExpr, setJqExpr] = useState<string>("");
  const [grepPatterns, setGrepPatterns] = useState<string[]>([""]);
  const [grepUseRg, setGrepUseRg] = useState<boolean>(false);
  const [grepCaseInsensitive, setGrepCaseInsensitive] = useState<boolean>(false);
  const [grepWord, setGrepWord] = useState<boolean>(false);
  const [grepFixed, setGrepFixed] = useState<boolean>(false);
  const [grepInvert, setGrepInvert] = useState<boolean>(false);
  const [grepExtraFlags, setGrepExtraFlags] = useState<string>("");
  const [commandInput, setCommandInput] = useState<string>("");
  const commandInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [lastAutoCommand, setLastAutoCommand] = useState<string>("");
  const runLogRef = useRef<string[]>([]);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaveError, setTemplateSaveError] = useState("");
  const [configSaveError, setConfigSaveError] = useState("");
  const [promptTemplate, setPromptTemplate] = useState<RequestTemplate | null>(null);
  const [promptValues, setPromptValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [globalOptionsOpen, setGlobalOptionsOpen] = useState<boolean>(false);
  const [flagHint, setFlagHint] = useState<FlagHint | null>(null);
  const [variablePrompt, setVariablePrompt] = useState<VariablePromptState | null>(null);
  const buildHeadersWithCookies = (req: ConcreteRequest, cookieItems: CookieItem[]) => {
    const cookieHeader = cookieItems
      .filter((c) => c.enabled && c.name.trim())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const filtered = cookieHeader
      ? req.headers.filter((h) => h.name.toLowerCase() !== "cookie")
      : [...req.headers];
    if (cookieHeader) {
      filtered.push({ id: "cookie-preview", name: "Cookie", value: cookieHeader, enabled: true });
    }
    return filtered;
  };

  const resetResults = () => {
    setResponse(null);
    setJqResult(null);
    setGrepResult(null);
    setFinalOutput("");
    setRawResult(null);
  };

  const applyRequestToBuilder = (
    nextRequest: ConcreteRequest,
    nextCookies?: CookieItem[],
    opts: { resetOutput?: boolean } = {}
  ) => {
    const normalized = normalizeRequest(nextRequest);
    if (opts.resetOutput !== false) {
      resetResults();
    }
    const cookieList =
      nextCookies ??
      (nextRequest.cookies && nextRequest.cookies.length ? nextRequest.cookies : [createEmptyCookie()]);
    setCookies(cookieList);
    setRequest(normalized);
    setJqExpr(nextRequest.jqExpression ?? "");
    const patterns =
      nextRequest.grepPatterns && nextRequest.grepPatterns.length ? nextRequest.grepPatterns : [""];
    setGrepPatterns(patterns);
    setGrepExtraFlags((nextRequest.grepFlags ?? []).join(" "));
    const grepOpts = nextRequest.grepOptions ?? {};
    setGrepCaseInsensitive(!!grepOpts.caseInsensitive);
    setGrepWord(!!grepOpts.wordMatch);
    setGrepFixed(!!grepOpts.fixedStrings);
    setGrepInvert(!!grepOpts.invertMatch);
    setGrepUseRg(!!nextRequest.useRipgrep);
    setCommandDirty(false);
    setLastAutoCommand("");
    setCommandInput("");
  };

  const markBuilderChange = () => {
    // Keep commandDirty state; reconciliation happens in commandPreview effect to preserve manual edits.
  };

  const grepPreview = useMemo(() => {
    const patterns = grepPatterns.filter((p) => p.trim().length > 0);
    if (!config) return "";
    if (patterns.length === 0) return "(grep preview)";
    const extraFlags = grepExtraFlags
      .split(/\s+/)
      .map((f) => f.trim())
      .filter(Boolean);
    const args = buildGrepArgs({
      inputText: "",
      useRipgrep: grepUseRg,
      patterns,
      flags: extraFlags,
      options: {
        caseInsensitive: grepCaseInsensitive,
        wordMatch: grepWord,
        fixedStrings: grepFixed,
        invertMatch: grepInvert,
      },
    });
    const bin = pickGrepBinary(config.grepPath, grepUseRg);
    return [bin, ...args].join(" ");
  }, [
    config,
    grepPatterns,
    grepUseRg,
    grepExtraFlags,
    grepCaseInsensitive,
    grepWord,
    grepFixed,
    grepInvert,
  ]);

  const hasShell = typeof window !== "undefined" && !!window.shell;

  useEffect(() => {
    if (!hasShell) {
      setSetupState("unavailable");
      setStatus("Preload bridge unavailable. Restart the desktop app after rebuilding.");
      return;
    }
    let active = true;
    setSetupState("loading");
    setStatus("Loading settings…");
    const boot = async () => {
      try {
        const detected = await window.shell.detectBinaries();
        const cfg = await window.shell.loadWorkspaceConfig();
        const tpls = await window.shell.loadTemplates();
        if (!Array.isArray(tpls)) throw new Error("Invalid template list");
        const merged: WorkspaceConfig = {
          ...detected, ...cfg,
          defaultCurlFlags: cfg?.defaultCurlFlags ?? detected.defaultCurlFlags,
          shortcuts: cfg?.shortcuts ?? detected.shortcuts ?? defaultShortcuts,
          globalCurlOptions: cfg?.globalCurlOptions ?? detected.globalCurlOptions ?? [],
        };
        if (!active) return;
        // Read all saved state before writing or enabling actions; a failed read
        // must never turn an existing collection into a newly saved empty one.
        await window.shell.saveWorkspaceConfig(merged);
        if (!active) return;
        setConfig(merged);
        setTemplates(tpls);
        setSetupState("ready");
        setStatus([!merged.jqPath && "jq not found", !merged.grepPath && "grep/rg not found"].filter(Boolean).join(" · "));
      } catch {
        if (!active) return;
        setSetupState("failed");
        setStatus("Setup failed. Check the data directory, config.json and templates.json, then retry. Existing files were not reset.");
      }
    };
    void boot();
    return () => { active = false; };
  }, [hasShell, setupAttempt]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hide = () => setFlagHint(null);
    const handleDocMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (commandInputRef.current && target instanceof Node && commandInputRef.current.contains(target)) {
        return;
      }
      setFlagHint(null);
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("mousedown", handleDocMouseDown);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("mousedown", handleDocMouseDown);
    };
  }, []);

  useEffect(() => {
    setFlagHint(null);
  }, [commandInput]);

  const persistConfig = (next: WorkspaceConfig) => {
    setConfig(next);
    if (hasShell) {
      setConfigSaveError("");
      void window.shell.saveWorkspaceConfig(next).catch(() => {
        setConfigSaveError("Settings could not be saved. Changes remain in this window. Check the data directory and retry.");
      });
    }
  };

  const flushRunLog = () => {
    if (!hasShell || !window.shell.writeRunLog) return;
    try {
      void window.shell.writeRunLog(runLogRef.current.join("\n"));
    } catch (_err) {
      // ignore log write failures in renderer
    }
  };

  const resetRunLog = (title: string) => {
    runLogRef.current = [title];
    flushRunLog();
  };

  const appendRunLog = (line: string) => {
    runLogRef.current.push(line);
    flushRunLog();
  };

  const updateGlobalCurlOption = (id: string, patch: Partial<GlobalCurlOption>) => {
    if (!config) return;
    const nextOptions = config.globalCurlOptions.map((opt) =>
      opt.id === id ? { ...opt, ...patch } : opt
    );
    persistConfig({ ...config, globalCurlOptions: nextOptions });
  };

  const addGlobalCurlOption = () => {
    if (!config) return;
    const nextOptions: GlobalCurlOption[] = [
      ...config.globalCurlOptions,
      { id: generateId(), label: "", argsText: "" },
    ];
    persistConfig({ ...config, globalCurlOptions: nextOptions });
  };

  const removeGlobalCurlOption = (id: string) => {
    if (!config) return;
    const nextOptions = config.globalCurlOptions.filter((opt) => opt.id !== id);
    persistConfig({ ...config, globalCurlOptions: nextOptions });
  };

  const collectVariableNames = () =>
    gatherRequestVariables(request, cookies, jqExpr, grepPatterns, grepExtraFlags);

  const curlPreview = useMemo(() => {
    if (!config) return "";
    const extraArgs = [...(request.curlOptions?.extraArgs ?? [])];
    const args = buildCurlArgs(request, {
      includeHeaders: request.curlOptions?.includeHeaders ?? config.defaultCurlFlags.includeHeaders,
      followRedirects: request.curlOptions?.followRedirects ?? config.defaultCurlFlags.followRedirects,
      silentAndShowErrors:
        request.curlOptions?.silentAndShowErrors ?? config.defaultCurlFlags.silentAndShowErrors,
      timeoutMs: request.curlOptions?.timeoutMs && request.curlOptions.timeoutMs > 0 ? request.curlOptions.timeoutMs : undefined,
      extraArgs,
    });
    return buildCurlCommandString(config.curlPath || "curl", args, false);
  }, [config, request]);

  const commandPreview = useMemo(() => {
    if (!config) return "";
    const headersWithCookies: Header[] = buildHeadersWithCookies(request, cookies);
    const requestWithCookies = { ...request, headers: headersWithCookies };

    const parts: string[] = [];
    const extraArgs = [...(requestWithCookies.curlOptions?.extraArgs ?? [])];
    const args = buildCurlArgs(requestWithCookies, {
      includeHeaders: !jqExpr.trim() && (requestWithCookies.curlOptions?.includeHeaders ?? config.defaultCurlFlags.includeHeaders),
      followRedirects: requestWithCookies.curlOptions?.followRedirects ?? config.defaultCurlFlags.followRedirects,
      silentAndShowErrors:
        requestWithCookies.curlOptions?.silentAndShowErrors ?? config.defaultCurlFlags.silentAndShowErrors,
      timeoutMs:
        requestWithCookies.curlOptions?.timeoutMs &&
        requestWithCookies.curlOptions.timeoutMs > 0
          ? requestWithCookies.curlOptions.timeoutMs
          : undefined,
      extraArgs,
    });
    if (jqExpr.trim()) args.splice(args.length - 2, 0, "--no-include");
    parts.push(buildCurlCommandString(config.curlPath || "curl", args, false));
    if (jqExpr.trim()) {
      const jqArgs = ["jq", "-c", escapeArgForShell(jqExpr.trim())];
      parts.push(jqArgs.join(" "));
    }
    const patterns = grepPatterns.filter((p) => p.trim().length > 0);
    if (patterns.length > 0) {
      const extraFlags = grepExtraFlags
        .split(/\\s+/)
        .map((f) => f.trim())
        .filter(Boolean);
      const args = buildGrepArgs({
        inputText: "",
        useRipgrep: grepUseRg,
        patterns,
        flags: extraFlags,
        options: {
          caseInsensitive: grepCaseInsensitive,
          wordMatch: grepWord,
          fixedStrings: grepFixed,
          invertMatch: grepInvert,
        },
      });
      const bin = pickGrepBinary(config.grepPath, grepUseRg);
      parts.push([bin, ...args.map(escapeArgForShell)].join(" "));
    }
    return parts.join(" | ");
  }, [
    config,
    request,
    jqExpr,
    grepPatterns,
    grepUseRg,
    grepExtraFlags,
    grepCaseInsensitive,
    grepWord,
    grepFixed,
    grepInvert,
    cookies,
  ]);

  const mergeManualEdits = (previousAuto: string, manual: string, nextAuto: string) => {
    if (!previousAuto) return nextAuto;
    const prevLen = previousAuto.length;
    const manualLen = manual.length;
    let prefix = 0;
    while (prefix < prevLen && prefix < manualLen && previousAuto[prefix] === manual[prefix]) {
      prefix++;
    }
    let suffix = 0;
    while (
      suffix < prevLen - prefix &&
      suffix < manualLen - prefix &&
      previousAuto[prevLen - 1 - suffix] === manual[manualLen - 1 - suffix]
    ) {
      suffix++;
    }
    const manualMid = manual.slice(prefix, manualLen - suffix);
    const safePrefix = Math.min(prefix, nextAuto.length);
    const safeSuffix = Math.min(suffix, Math.max(0, nextAuto.length - safePrefix));
    const similarity = (prefix + suffix) / Math.max(prevLen, manualLen, 1);
    if (similarity < 0.4) {
      return nextAuto;
    }
    const nextPrefix = nextAuto.slice(0, safePrefix);
    const nextSuffix = safeSuffix ? nextAuto.slice(nextAuto.length - safeSuffix) : "";
    return nextPrefix + manualMid + nextSuffix;
  };

  useEffect(() => {
    if (!commandDirty) {
      if (commandInput !== commandPreview) {
        setCommandInput(commandPreview);
      }
      if (lastAutoCommand !== commandPreview) {
        setLastAutoCommand(commandPreview);
      }
      return;
    }
    const merged = mergeManualEdits(lastAutoCommand, commandInput, commandPreview);
    if (commandInput !== merged) {
      setCommandInput(merged);
    }
    if (lastAutoCommand !== commandPreview) {
      setLastAutoCommand(commandPreview);
    }
  }, [commandPreview, commandDirty, commandInput, lastAutoCommand]);

  const handleCommandSelection = (event: React.SyntheticEvent<HTMLTextAreaElement, Event>) => {
    const target = event.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    if (start === end) {
      setFlagHint(null);
      return;
    }
    const raw = target.value.slice(start, end).trim();
    if (!raw || /\s/.test(raw) || raw.includes("\n")) {
      setFlagHint(null);
      return;
    }
    const baseToken = raw.split(/\s+/)[0];
    const token = baseToken.replace(/^['"]+/, "").replace(/['"]+$/, "");
    const description = getCurlFlagDescription(token);
    if (!description) {
      setFlagHint(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    const offset = 12;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0;
    let clientX: number | null = null;
    let clientY: number | null = null;
    if (event.nativeEvent instanceof MouseEvent) {
      clientX = event.nativeEvent.clientX;
      clientY = event.nativeEvent.clientY;
    }
    const fallbackX = rect.left + rect.width / 2;
    const fallbackY = rect.top + 20;
    const x =
      typeof window !== "undefined"
        ? Math.min((clientX ?? fallbackX) + offset, Math.max(0, viewportWidth - 240))
        : clientX ?? fallbackX;
    const y =
      typeof window !== "undefined"
        ? Math.min((clientY ?? fallbackY) + offset, Math.max(0, viewportHeight - 100))
        : clientY ?? fallbackY;
    setFlagHint({ flag: token, description, x, y });
  };

  const setRequestField = (field: Partial<ConcreteRequest>) => {
    markBuilderChange();
    setRequest((prev) => ({ ...prev, ...field }));
  };

  const updateHeader = (id: string, patch: Partial<Header>) => {
    markBuilderChange();
    setRequest((prev) => ({
      ...prev,
      headers: prev.headers.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  };

  const addHeader = () => {
    markBuilderChange();
    const newHeader = createEmptyHeader();
    setRequest((prev) => ({ ...prev, headers: [...prev.headers, newHeader] }));
  };

  const removeHeader = (id: string) => {
    markBuilderChange();
    setRequest((prev) => {
      const next = prev.headers.filter((h) => h.id !== id);
      return { ...prev, headers: next.length ? next : [createEmptyHeader()] };
    });
  };

  const addFormField = () => {
    markBuilderChange();
    const newField: BodyFormField = { id: generateId(), name: "", value: "", enabled: true };
    setRequest((prev) => ({
      ...prev,
      body: { ...prev.body, formFields: [...prev.body.formFields, newField], mode: "form" },
    }));
  };

  const updateFormField = (id: string, patch: Partial<BodyFormField>) => {
    markBuilderChange();
    setRequest((prev) => ({
      ...prev,
      body: {
        ...prev.body,
        formFields: prev.body.formFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      },
    }));
  };

  const removeFormField = (id: string) => {
    markBuilderChange();
    setRequest((prev) => ({
      ...prev,
      body: { ...prev.body, formFields: prev.body.formFields.filter((f) => f.id !== id) },
    }));
  };

  const addCookie = () => {
    markBuilderChange();
    setCookies((prev) => [...prev, createEmptyCookie()]);
  };

  const updateCookie = (id: string, patch: Partial<CookieItem>) => {
    markBuilderChange();
    setCookies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeCookie = (id: string) => {
    markBuilderChange();
    setCookies((prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next.length ? next : [createEmptyCookie()];
    });
  };

  const insertGlobalOptionPreset = (opt: GlobalCurlOption) => {
    markBuilderChange();
    const tokens = tokenizeSimple(opt.argsText);
    setRequest((prev) => {
      const extraArgs = [...(prev.curlOptions?.extraArgs ?? []), ...tokens];
      const curlOptions = { ...(prev.curlOptions ?? config?.defaultCurlFlags ?? {}), extraArgs };
      return { ...prev, curlOptions };
    });
  };

  const updateGrepPattern = (index: number, value: string) => {
    setGrepPatterns((prev) => prev.map((p, i) => (i === index ? value : p)));
  };

  const addGrepPattern = () => {
    setGrepPatterns((prev) => [...prev, ""]);
  };

  const removeGrepPattern = (index: number) => {
    setGrepPatterns((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)));
  };

  const currentRequest = (): ConcreteRequest => ({
    ...request, cookies, jqExpression: jqExpr,
    curlOptions: { ...config.defaultCurlFlags, ...request.curlOptions },
    grepPatterns: grepPatterns.filter((p) => p.trim().length > 0),
    grepFlags: grepExtraFlags.split(/\s+/).filter(Boolean),
    grepOptions: { caseInsensitive: grepCaseInsensitive, wordMatch: grepWord,
      fixedStrings: grepFixed, invertMatch: grepInvert },
    useRipgrep: grepUseRg,
  });

  const runWithVariables = async (vars: Record<string, string>, source = currentRequest()) => {
    if (setupState !== "ready") return;
    // Execute this snapshot; React state updates do not change an existing closure.
    const request = source;
    const cookies = source.cookies ?? [];
    const jqExpr = source.jqExpression ?? "";
    const grepPatterns = source.grepPatterns ?? [];
    const grepExtraFlags = (source.grepFlags ?? []).join(" ");
    const grepUseRg = !!source.useRipgrep;
    const grepCaseInsensitive = !!source.grepOptions?.caseInsensitive;
    const grepWord = !!source.grepOptions?.wordMatch;
    const grepFixed = !!source.grepOptions?.fixedStrings;
    const grepInvert = !!source.grepOptions?.invertMatch;
    const { request: resolvedRequest, cookies: resolvedCookies } = resolveRequestWithVariables(request, cookies, vars);
    const headersWithCookies: Header[] = buildHeadersWithCookies(resolvedRequest, resolvedCookies);

    const patterns = grepPatterns.filter((p) => p.trim().length > 0);
    const resolvedPatterns = patterns.map((p) => substituteVars(p, vars));
    const extraFlagsRaw = grepExtraFlags
      .split(/\s+/)
      .map((f) => f.trim())
      .filter(Boolean);
    const resolvedExtraFlags = extraFlagsRaw.map((flag) => substituteVars(flag, vars));
    const grepOptions = {
      caseInsensitive: grepCaseInsensitive,
      wordMatch: grepWord,
      fixedStrings: grepFixed,
      invertMatch: grepInvert,
    };

    appendRunLog(`Method: ${request.method}`);
    appendRunLog(`Enabled headers: ${headersWithCookies.filter((h) => h.enabled).length}`);
    appendRunLog(`Enabled cookies: ${resolvedCookies.filter((c) => c.enabled && c.name).length}`);
    appendRunLog(`Filters: jq=${!!jqExpr.trim()} grep=${resolvedPatterns.length > 0}`);
    appendRunLog(`manual edits: ${mergeManualEdits(lastAutoCommand, commandInput, commandPreview) !== commandPreview ? "present" : "none"}`);

    resetResults();
    setLoading(true);
    setStatus("Running curl...");
    const executionId = generateId();
    setActiveProcessId(executionId);
    try {
      const jqExpressionResolved = substituteVars(jqExpr, vars);
      const requestWithFilters: ConcreteRequest = {
        ...resolvedRequest,
        headers: headersWithCookies,
        cookies: resolvedCookies,
        jqExpression: jqExpressionResolved,
        grepPatterns: resolvedPatterns,
        grepFlags: resolvedExtraFlags,
        grepOptions,
        useRipgrep: grepUseRg,
      };
      const execResult = await window.shell.runCurl({
        request: requestWithFilters,
        executionId,
        extraCurlArgs: [],
      });
      appendRunLog(`curl exit: ${execResult.exitCode} stdout=${execResult.stdout.length}B stderr=${execResult.stderr.length}B`);
      // Kill should only apply while curl is active; disable as soon as curl returns.
      setActiveProcessId(null);
      setResponse(execResult);
      setRawResult(execResult);
      setFinalOutput(execResult.stdout);
      setFinalStage("curl");
      setStatus(`curl done (exit ${execResult.exitCode ?? ""})`);

      if (execResult.errorMessage || execResult.exitCode !== 0) {
        setFinalOutput(execResult.stderr || execResult.errorMessage || execResult.stdout);
        setStatus("curl failed. Check the error output, binary path and request settings.");
        return;
      }

      // Keep unresolved inputs in memory only. Prompt values never enter history.
      const entry: HistoryEntry = { id: generateId(), createdAt: Date.now(), request: {
        ...request, cookies, jqExpression: jqExpr, grepPatterns: patterns,
        grepFlags: extraFlagsRaw, grepOptions, useRipgrep: grepUseRg, resolvedVariables: {},
      } };
      setHistory((previous) => [entry, ...previous]);

      let jqOut: JqExecutionResult | null = null;
      if (jqExpressionResolved.trim()) {
        setStatus("Running jq...");
        jqOut = await window.shell.runJq({
          expr: jqExpressionResolved,
          jsonInput: execResult.responseBody ?? execResult.stdout,
        });
        appendRunLog(`jq exit: ${jqOut.exitCode} stdout=${jqOut.stdout.length}B stderr=${jqOut.stderr.length}B`);
        setJqResult(jqOut);
        setFinalOutput(jqOut.stdout || jqOut.stderr || jqOut.errorMessage || "");
        setFinalStage("jq");
        if (jqOut.errorMessage || jqOut.exitCode !== 0) {
          setFinalOutput(jqOut.stderr || jqOut.errorMessage || jqOut.stdout);
          setStatus("jq failed. Check the error output, binary path and expression.");
          return;
        }
        setStatus(`jq done (exit ${jqOut.exitCode ?? "?"})`);
      } else {
        setJqResult(null);
      }

      if (resolvedPatterns.length > 0) {
        setStatus("Running grep/rg...");
        const grepInput = jqOut ? jqOut.stdout : execResult.stdout;
        const gr = await window.shell.runGrep({
          patterns: resolvedPatterns,
          inputText: grepInput,
          useRipgrep: grepUseRg,
          flags: resolvedExtraFlags,
          options: grepOptions,
        });
        appendRunLog(`grep exit: ${gr.exitCode} stdout=${gr.stdout.length}B stderr=${gr.stderr.length}B`);
        setGrepResult(gr);
        setFinalOutput(gr.stdout || gr.stderr || gr.errorMessage || "");
        setFinalStage("grep");
        setStatus(gr.errorMessage || (gr.exitCode !== 0 && gr.exitCode !== 1)
          ? "grep/rg failed. Check the error output, binary path and pattern."
          : gr.exitCode === 1 ? "grep/rg: no matches" : `grep/rg done (exit ${gr.exitCode})`);
      } else {
        setGrepResult(null);
      }
    } catch (err: any) {
      setStatus(err?.message || "Run failed");
      appendRunLog("error: Run failed (details shown in the application)");
    } finally {
      setLoading(false);
      setActiveProcessId(null);
    }
  };

  const handleRun = async (overrideVars?: Record<string, string>) => {
    if (setupState !== "ready" || loading) return;
    resetRunLog(`Run @ ${new Date().toISOString()}`);
    const requiredVars = collectVariableNames();
    const mergedVars = {
      ...(request.resolvedVariables ?? {}),
      ...(overrideVars ?? {}),
    };
    if (requiredVars.length > 0 && !overrideVars) {
      const defaults: Record<string, string> = {};
      requiredVars.forEach((name) => {
        defaults[name] = mergedVars[name] ?? "";
      });
      setVariablePrompt({ names: requiredVars, values: defaults });
      return;
    }
    setRequest((prev) => ({ ...prev, resolvedVariables: mergedVars }));
    await runWithVariables(mergedVars);
  };

  useEffect(() => {
    if (!config?.shortcuts?.runRequest) return;
    const handler = (e: KeyboardEvent) => {
      if (matchesShortcut(e, config.shortcuts.runRequest)) {
        e.preventDefault();
        if (loading || templateName !== null || promptTemplate || variablePrompt || globalOptionsOpen) return;
        void handleRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [config?.shortcuts?.runRequest, handleRun]);

  const handleParseCommand = (text?: string) => {
    const input = text ?? commandInput;
    const segments = input.split("|").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) {
      setStatus("Nothing to parse");
      return;
    }

    // curl part
    const curlSegment = segments.find((s) => s.includes("curl")) || segments[0];
    const parsedCurl = parseCurlCommand(curlSegment);
    if (!parsedCurl) {
      setStatus("Failed to parse curl");
      return;
    }
    const preservedExtras = request.curlOptions?.extraArgs ?? [];
    const parsedOptions = parsedCurl.request.curlOptions ?? {
      includeHeaders: request.curlOptions?.includeHeaders ?? config?.defaultCurlFlags.includeHeaders ?? false,
      followRedirects: request.curlOptions?.followRedirects ?? config?.defaultCurlFlags.followRedirects ?? false,
      silentAndShowErrors:
        request.curlOptions?.silentAndShowErrors ?? config?.defaultCurlFlags.silentAndShowErrors ?? false,
      timeoutMs: request.curlOptions?.timeoutMs,
      extraArgs: [],
    };
    const mergedCurlOptions = {
      ...parsedOptions,
      extraArgs: [...(parsedOptions.extraArgs ?? []), ...preservedExtras],
    };
    setRequest(
      normalizeRequest({
        ...parsedCurl.request,
        id: generateId(),
        curlOptions: mergedCurlOptions,
        globalOptionIds: request.globalOptionIds ?? [],
      })
    );

    // jq part
    const jqSegment = segments.find((s) => s.startsWith("jq") || s.includes(" jq "));
    if (jqSegment) {
      const jqTokens = tokenizeSimple(jqSegment);
      const expr = jqTokens.find((t, idx) => jqTokens[idx - 1] !== "-c" && t !== "jq" && t !== "-c");
      if (expr) {
        setJqExpr(expr.replace(/^['"]|['"]$/g, ""));
      }
    } else {
      setJqExpr("");
    }

    // grep/rg part
    const grepSegment = segments.find((s) => s.startsWith("rg") || s.startsWith("grep") || s.includes(" rg ") || s.includes(" grep "));
    if (grepSegment) {
      const tokens = tokenizeSimple(grepSegment);
      const useRgDetected = tokens[0] === "rg" || grepSegment.includes(" rg ");
      setGrepUseRg(useRgDetected);
      const patterns: string[] = [];
      const flags: string[] = [];
      let opts = { caseInsensitive: false, wordMatch: false, fixedStrings: false, invertMatch: false };
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === "-i") opts.caseInsensitive = true;
        else if (t === "-w") opts.wordMatch = true;
        else if (t === "-F") opts.fixedStrings = true;
        else if (t === "-v") opts.invertMatch = true;
        else if (t === "-e" && tokens[i + 1]) {
          patterns.push(tokens[i + 1]);
          i++;
        } else if (t.startsWith("-")) {
          flags.push(t);
        } else {
          patterns.push(t);
        }
      }
      setGrepPatterns(patterns.length ? patterns : [""]);
      setGrepExtraFlags(flags.filter((f) => !["-i", "-w", "-F", "-v"].includes(f)).join(" "));
      setGrepCaseInsensitive(opts.caseInsensitive);
      setGrepWord(opts.wordMatch);
      setGrepFixed(opts.fixedStrings);
      setGrepInvert(opts.invertMatch);
    } else {
      setGrepPatterns([""]);
      setGrepExtraFlags("");
      setGrepCaseInsensitive(false);
      setGrepWord(false);
      setGrepFixed(false);
      setGrepInvert(false);
    }

    setStatus("Parsed command into builder");
  };

  const handleKill = () => {
    if (activeProcessId) {
      window.shell.killProcess(activeProcessId);
      setStatus("Process kill requested");
    }
  };

  const openTemplatePrompt = (tpl: RequestTemplate) => {
    const source = requestFromTemplate(tpl);
    const vars = gatherRequestVariables(source, source.cookies ?? [], source.jqExpression ?? "",
      source.grepPatterns ?? [], (source.grepFlags ?? []).join(" "));
    const initial: Record<string, string> = {};
    vars.forEach((v) => {
      const meta = tpl.variablesMeta?.find((m) => m.name === v);
      initial[v] = meta?.defaultValue ?? "";
    });
    setPromptValues(initial);
    setPromptTemplate(tpl);
  };

  const confirmTemplateRun = () => {
    if (!promptTemplate || setupState !== "ready" || loading) return;
    const source = { ...requestFromTemplate(promptTemplate), resolvedVariables: { ...promptValues } };
    applyRequestToBuilder(source);
    setPromptTemplate(null);
    resetRunLog(`Run @ ${new Date().toISOString()}`);
    void runWithVariables(promptValues, source);
  };

  const saveTemplateFromCurrent = async () => {
    const name = templateName?.trim();
    if (!name || savingTemplate || setupState !== "ready") return;
    setSavingTemplate(true);
    setTemplateSaveError("");
    const tpl = templateFromRequest(currentRequest(), name);
    const next = [...templates, tpl];
    try {
      await window.shell.saveTemplates(next);
      setTemplates(next);
      setTemplateName(null);
      setStatus("Template saved");
    } catch {
      setStatus("Template not saved");
      setTemplateSaveError("Could not save template. Check the data directory and try again.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const loadHistoryEntry = (entry: HistoryEntry) => {
    const cookiesFromHistory =
      entry.request.cookies && entry.request.cookies.length ? entry.request.cookies : [createEmptyCookie()];
    applyRequestToBuilder(normalizeRequest({ ...entry.request, id: generateId() }), cookiesFromHistory);
  };

  return (
    <div className="app-shell">
      <div className="toolbar">
        <button
          onClick={() => {
            applyRequestToBuilder(createEmptyRequest());
          }}
        >
          New
        </button>
        <button onClick={() => handleRun()} disabled={loading || setupState !== "ready"}>
          {loading ? "Running..." : "Run"}
        </button>
        <button onClick={handleKill} className="ghost" disabled={!activeProcessId}>
          Kill
        </button>
        <button onClick={() => { setTemplateSaveError(""); setTemplateName(""); }} className="ghost" disabled={setupState !== "ready"}>
          Save as template
        </button>
        <button className="ghost" disabled={setupState !== "ready"} onClick={() => setGlobalOptionsOpen(true)}>
          Global curl options
        </button>
        <span className="small" role="status">{status}</span>
        {setupState === "failed" && <button className="ghost" onClick={() => setSetupAttempt((value) => value + 1)}>Retry setup</button>}
      </div>

      {configSaveError && !globalOptionsOpen && (
        <div className="save-error" role="alert">{configSaveError}
          <button className="ghost" onClick={() => persistConfig(config)}>Retry settings save</button>
        </div>
      )}
      <div className="main-layout">
        <div className="panel">
          <div className="section-title">Templates</div>
          <div className="list">
            {templates.length === 0 && <div className="list-item">No templates yet</div>}
            {templates.map((tpl) => (
              <button key={tpl.id} className="list-item template-item" disabled={setupState !== "ready" || loading} onClick={() => openTemplatePrompt(tpl)}>
                <div>{tpl.name}</div>
                <div className="small">{tpl.method} · {tpl.urlTemplate}</div>
              </button>
            ))}
          </div>

          <div className="section-title">History (this session)</div>
          <div className="list">
            {history.length === 0 && <div className="list-item">No runs yet</div>}
            {history.map((h) => (
              <button key={h.id} className="list-item history-item" disabled={loading} onClick={() => loadHistoryEntry(h)}>
                <div>{h.request.method} · {h.request.url}</div>
                <div className="small">{new Date(h.createdAt).toLocaleTimeString()}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel request-builder">
          <div className="section-title">Request</div>
          <div className="field-row">
            <label htmlFor="request-method">Method</label>
            <select id="request-method"
              value={request.method}
              onChange={(e) => setRequestField({ method: e.target.value as HttpMethod })}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label htmlFor="request-url">URL</label>
            <input id="request-url"
              value={request.url}
              onChange={(e) => setRequestField({ url: e.target.value })}
              placeholder="https://"
            />
          </div>

          <div className="section-title">Headers</div>
          <table className="headers-table">
            <colgroup>
              <col style={{ width: "60px" }} />
              <col style={{ width: "28%" }} />
              <col />
              <col style={{ width: "56px" }} />
            </colgroup>
            <thead>
              <tr>
                <th>On</th>
                <th>Name</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {request.headers.map((h, index) => (
                <tr key={h.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Enable header ${index + 1}`}
                      checked={h.enabled}
                      onChange={(e) => updateHeader(h.id, { enabled: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="Header name"
                      value={h.name}
                      onChange={(e) => updateHeader(h.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="Header value"
                      value={h.value}
                      onChange={(e) => updateHeader(h.id, { value: e.target.value })}
                    />
                  </td>
                  <td>
                    <button className="ghost" aria-label={`Remove header ${index + 1}`} onClick={() => removeHeader(h.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="ghost" onClick={addHeader}>+ Header</button>

          <div className="section-title">Body</div>
          {["POST", "PUT", "PATCH"].includes(request.method) && (
            <>
              <div className="field-row">
                <label htmlFor="request-body-mode">Mode</label>
                <select id="request-body-mode"
                  value={request.body.mode}
                  onChange={(e) => setRequest((prev) => ({
                    ...prev,
                    body: { ...prev.body, mode: e.target.value as any },
                  }))}
                >
                  <option value="none">None</option>
                  <option value="json">JSON</option>
                  <option value="raw">Raw</option>
                  <option value="form">Form</option>
                </select>
              </div>

              {(request.body.mode === "json" || request.body.mode === "raw") && (
                <textarea
                  aria-label="Request body"
                  className="mono"
                  value={request.body.rawText}
                  onChange={(e) => setRequest((prev) => ({
                    ...prev,
                    body: { ...prev.body, rawText: e.target.value },
                  }))}
                  placeholder={request.body.mode === "json" ? '{"foo": "bar"}' : "raw data"}
                />
              )}

              {request.body.mode === "form" && (
                <>
                  <table className="form-table">
                    <colgroup>
                      <col style={{ width: "60px" }} />
                      <col style={{ width: "28%" }} />
                      <col />
                      <col style={{ width: "56px" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>On</th>
                        <th>Name</th>
                        <th>Value</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {request.body.formFields.map((f, index) => (
                        <tr key={f.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Enable form field ${index + 1}`}
                              checked={f.enabled}
                              onChange={(e) => updateFormField(f.id, { enabled: e.target.checked })}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Form field name ${index + 1}`}
                              value={f.name}
                              onChange={(e) => updateFormField(f.id, { name: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Form field value ${index + 1}`}
                              value={f.value}
                              onChange={(e) => updateFormField(f.id, { value: e.target.value })}
                            />
                          </td>
                          <td>
                            <button className="ghost" aria-label={`Remove form field ${index + 1}`} onClick={() => removeFormField(f.id)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="ghost" onClick={addFormField}>+ Field</button>
                </>
              )}
            </>
          )}

          <div className="section-title">Cookies</div>
          <div className="cookies-list">
            {cookies.map((c, idx) => (
              <div key={c.id} className="cookie-row">
                <div className="flex-row" style={{ gap: "6px" }}>
                  <input
                    type="checkbox"
                    aria-label={`Enable cookie ${idx + 1}`}
                    checked={c.enabled}
                    onChange={(e) => updateCookie(c.id, { enabled: e.target.checked })}
                    title="Enabled"
                  />
                  <input
                    list="cookie-names"
                    placeholder="name"
                    aria-label={`Cookie name ${idx + 1}`}
                    value={c.name}
                    onChange={(e) => updateCookie(c.id, { name: e.target.value })}
                  />
                  <input
                    placeholder="value"
                    aria-label={`Cookie value ${idx + 1}`}
                    value={c.value}
                    onChange={(e) => updateCookie(c.id, { value: e.target.value })}
                  />
                  <button className="ghost" aria-label={`Remove cookie ${idx + 1}`} onClick={() => removeCookie(c.id)} type="button">×</button>
                </div>
                <div className="flex-row" style={{ gap: "6px", flexWrap: "wrap" }}>
                  <input
                    placeholder="Path"
                    aria-label={`Cookie path ${idx + 1}`}
                    value={c.path}
                    onChange={(e) => updateCookie(c.id, { path: e.target.value })}
                  />
                  <input
                    placeholder="Domain"
                    aria-label={`Cookie domain ${idx + 1}`}
                    value={c.domain}
                    onChange={(e) => updateCookie(c.id, { domain: e.target.value })}
                  />
                  <select
                    aria-label={`Cookie SameSite ${idx + 1}`}
                    value={c.sameSite || ""}
                    onChange={(e) => updateCookie(c.id, { sameSite: e.target.value as any })}
                  >
                    <option value="">SameSite</option>
                    <option value="Lax">Lax</option>
                    <option value="Strict">Strict</option>
                    <option value="None">None</option>
                  </select>
                  <label className="small">
                    <input
                      type="checkbox"
                      checked={c.secure}
                      onChange={(e) => updateCookie(c.id, { secure: e.target.checked })}
                    />
                    Secure
                  </label>
                  <label className="small">
                    <input
                      type="checkbox"
                      checked={c.httpOnly}
                      onChange={(e) => updateCookie(c.id, { httpOnly: e.target.checked })}
                    />
                    HttpOnly
                  </label>
                </div>
                {idx < cookies.length - 1 && <div className="divider"></div>}
              </div>
            ))}
            <button className="ghost" onClick={addCookie} type="button">+ Cookie</button>
            <datalist id="cookie-names">
              <option value="sessionid" />
              <option value="csrftoken" />
              <option value="auth_token" />
              <option value="jwt" />
              <option value="sid" />
              <option value="uid" />
              <option value="refresh_token" />
              <option value="access_token" />
            </datalist>
          </div>

          {config.globalCurlOptions.length > 0 && (
            <>
              <div className="section-title">Global curl presets (insert into command)</div>
              <div
                className="global-option-toggles"
              >
                {config.globalCurlOptions.map((opt) => (
                  <button
                    key={opt.id}
                    className="ghost"
                    type="button"
                    aria-label={`Insert preset ${opt.label || opt.argsText}`}
                    title={opt.argsText || ""}
                    onClick={() => insertGlobalOptionPreset(opt)}
                    style={{
                      maxWidth: "160px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      padding: "6px 10px",
                      margin: 0,
                    }}
                  >
                    {opt.label || opt.argsText || "Preset"}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="section-title">grep / jq (auto-run after curl)</div>
          <div className="flex-row" style={{ gap: "6px", flexWrap: "wrap" }}>
            <button
              className={`ghost ${!grepUseRg ? "active" : ""}`}
              aria-pressed={!grepUseRg}
              onClick={() => setGrepUseRg(false)}
              type="button"
            >
              grep
            </button>
            <button
              className={`ghost ${grepUseRg ? "active" : ""}`}
              aria-pressed={grepUseRg}
              onClick={() => setGrepUseRg(true)}
              type="button"
            >
              rg
            </button>
          </div>
          {grepPatterns.map((p, idx) => (
            <div className="field-row" key={idx}>
              <label htmlFor={`grep-pattern-${idx}`}>Pattern {idx + 1}</label>
              <div className="flex-row" style={{ gap: "6px", width: "100%" }}>
                <input id={`grep-pattern-${idx}`}
                  style={{ flex: 1 }}
                  value={p}
                  onChange={(e) => updateGrepPattern(idx, e.target.value)}
                  placeholder="pattern or regex"
                />
                <button className="ghost" aria-label={`Remove pattern ${idx + 1}`} onClick={() => removeGrepPattern(idx)} type="button">
                  ×
                </button>
              </div>
            </div>
          ))}
          <button className="ghost" onClick={addGrepPattern} type="button">+ Pattern (OR)</button>

          <div className="flex-row" style={{ gap: "12px", flexWrap: "wrap" }}>
            <label className="small"><input type="checkbox" checked={grepCaseInsensitive} onChange={(e) => setGrepCaseInsensitive(e.target.checked)} /> case-insensitive (-i)</label>
            <label className="small"><input type="checkbox" checked={grepWord} onChange={(e) => setGrepWord(e.target.checked)} /> word match (-w)</label>
            <label className="small"><input type="checkbox" checked={grepFixed} onChange={(e) => setGrepFixed(e.target.checked)} /> fixed strings (-F)</label>
            <label className="small"><input type="checkbox" checked={grepInvert} onChange={(e) => setGrepInvert(e.target.checked)} /> invert (-v)</label>
          </div>

          <div className="field-row">
            <label htmlFor="grep-extra-flags">Extra flags</label>
            <input id="grep-extra-flags"
              value={grepExtraFlags}
              onChange={(e) => setGrepExtraFlags(e.target.value)}
              placeholder="e.g. --pcre2 --no-heading"
            />
          </div>

          <div className="field-row">
            <label htmlFor="jq-expression">jq expr</label>
            <input id="jq-expression" value={jqExpr} onChange={(e) => setJqExpr(e.target.value)} placeholder=".data" />
          </div>
        </div>

        <div className="panel response-panel">
          <div className="section-title">
            Command (curl | jq | grep)
            <span className="info-icon">
              ?
              <span className="info-tooltip">
                Select any curl flag within the command preview to pop up its description.
              </span>
            </span>
          </div>
          <div className="flex-row">
            <textarea
              aria-label="Command preview"
              className="mono"
              value={commandInput}
              ref={commandInputRef}
              onChange={(e) => {
                setCommandDirty(true);
                setCommandInput(e.target.value);
                handleParseCommand(e.target.value);
              }}
              onMouseUp={handleCommandSelection}
              onMouseDown={() => setFlagHint(null)}
              onScroll={() => setFlagHint(null)}
              onBlur={() => setFlagHint(null)}
              onSelect={handleCommandSelection}
              placeholder="curl ... | jq ... | grep ..."
              style={{ flex: 1, minHeight: "140px" }}
            />
          </div>

          <div className="section-title">Result</div>
          <div className="tabs">
            <button
              className={`tab-button ${resultTab === "chain" ? "active" : ""}`}
              aria-pressed={resultTab === "chain"}
              onClick={() => setResultTab("chain")}
            >
              chain
            </button>
            <button
              className={`tab-button ${resultTab === "raw" ? "active" : ""}`}
              aria-pressed={resultTab === "raw"}
              onClick={() => setResultTab("raw")}
            >
              raw (curl only)
            </button>
          </div>
          <div className="code-block" style={{ flex: 1, overflow: "auto" }}>
            {resultTab === "chain" ? (
              <pre>{loading ? "..." : finalOutput || "(no output)"}</pre>
            ) : (
              <pre>{loading ? "..." : rawResult?.stdout || rawResult?.stderr || rawResult?.errorMessage || "(no output)"}</pre>
            )}
          </div>
          {resultTab === "chain" && response && (
            <div className="small">
              Exit {response.exitCode ?? "?"} · {((response.finishedAt - response.startedAt) / 1000).toFixed(2)}s ·
              {finalOutput?.length || 0} bytes (stage: {finalStage})
            </div>
          )}
          {resultTab === "raw" && rawResult && (
            <div className="small">
              Exit {rawResult.exitCode ?? "?"} · {(rawResult.finishedAt && rawResult.startedAt
                ? ((rawResult.finishedAt - rawResult.startedAt) / 1000).toFixed(2)
                : "?")}s · {rawResult.stdout?.length || 0} bytes (stage: curl)
            </div>
          )}
        </div>
      </div>

      {variablePrompt && (
        <Modal titleId="request-vars-title" onCancel={() => setVariablePrompt(null)} width={420}>
          <form className="modal-form" onSubmit={(event) => {
            event.preventDefault();
            const values = { ...variablePrompt.values };
            setVariablePrompt(null);
            void handleRun(values);
          }}>
            <div className="section-title" id="request-vars-title">Provide variable values</div>
            {variablePrompt.names.map((name) => (
              <div className="field-row" key={name}>
                <label htmlFor={`request-var-${name}`}>{name}</label>
                <input id={`request-var-${name}`} value={variablePrompt.values[name] ?? ""}
                  onChange={(event) => setVariablePrompt((prev) => prev
                    ? { ...prev, values: { ...prev.values, [name]: event.target.value } } : prev)} />
              </div>
            ))}
            <div className="flex-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ghost" onClick={() => setVariablePrompt(null)}>Cancel</button>
              <button type="submit">Run</button>
            </div>
          </form>
        </Modal>
      )}
      {templateName !== null && (
        <Modal titleId="save-template-title" onCancel={() => setTemplateName(null)} closeDisabled={savingTemplate}>
          <form className="modal-form" onSubmit={(event) => { event.preventDefault(); void saveTemplateFromCurrent(); }}>
            <div className="section-title" id="save-template-title">Save template</div>
            {templateSaveError && <div role="alert">{templateSaveError}</div>}
            <div className="field-row">
              <label htmlFor="template-name">Template name</label>
              <input id="template-name" autoFocus value={templateName} disabled={savingTemplate}
                onChange={(event) => setTemplateName(event.target.value)} />
            </div>
            <div className="flex-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ghost" disabled={savingTemplate} onClick={() => setTemplateName(null)}>Cancel</button>
              <button type="submit" disabled={!templateName.trim() || savingTemplate}>{savingTemplate ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}
      {promptTemplate && (
        <Modal titleId="template-vars-title" onCancel={() => setPromptTemplate(null)}>
          <form className="modal-form" onSubmit={(event) => { event.preventDefault(); confirmTemplateRun(); }}>
            <div className="section-title" id="template-vars-title">Fill template vars</div>
            {Object.keys(promptValues).length === 0 && <div>No variables detected.</div>}
            {Object.entries(promptValues).map(([name, value]) => (
              <div className="field-row" key={name}>
                <label htmlFor={`template-var-${name}`}>{name}</label>
                <input id={`template-var-${name}`} value={value}
                  onChange={(event) => setPromptValues((prev) => ({ ...prev, [name]: event.target.value }))} />
              </div>
            ))}
            <div className="flex-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ghost" onClick={() => setPromptTemplate(null)}>Cancel</button>
              <button type="submit">Run</button>
            </div>
          </form>
        </Modal>
      )}
      {globalOptionsOpen && config && (
        <Modal titleId="global-options-title" onCancel={() => setGlobalOptionsOpen(false)} width={640}>
          <div className="section-title" id="global-options-title">Global curl options</div>
          {configSaveError && <div className="save-error" role="alert">{configSaveError}
            <button className="ghost" onClick={() => persistConfig(config)}>Retry settings save</button>
          </div>}
          <div className="small">
            Define snippets once and they will show up as checkboxes in every request. Mark them per request to append the args.
          </div>
          <div className="global-options-list">
            {config.globalCurlOptions.length === 0 && (
              <div className="small">No options yet. Add one to reuse curl args with a label.</div>
            )}
            {config.globalCurlOptions.map((opt, index) => (
              <div key={opt.id} className="global-option-row">
                <div className="flex-row" style={{ gap: "6px", alignItems: "center" }}>
                  <input aria-label={`Preset ${index + 1} label`} value={opt.label}
                    onChange={(event) => updateGlobalCurlOption(opt.id, { label: event.target.value })}
                    placeholder="Label (e.g. Example routing)" />
                  <button className="ghost" aria-label={`Remove preset ${index + 1}`}
                    onClick={() => removeGlobalCurlOption(opt.id)} type="button">×</button>
                </div>
                <input className="mono" aria-label={`Preset ${index + 1} curl arguments`} value={opt.argsText}
                  onChange={(event) => updateGlobalCurlOption(opt.id, { argsText: event.target.value })}
                  placeholder="curl args e.g. --resolve example.com:443:192.0.2.10" />
              </div>
            ))}
          </div>
          <div className="flex-row" style={{ justifyContent: "space-between" }}>
            <button className="ghost" onClick={addGlobalCurlOption} type="button">+ Option</button>
            <button onClick={() => setGlobalOptionsOpen(false)}>Close</button>
          </div>
        </Modal>
      )}
      {flagHint && (
        <div className="flag-tooltip" style={{ left: flagHint.x, top: flagHint.y }}>
          <div className="flag-tooltip-name">{flagHint.flag}</div>
          <div className="flag-tooltip-desc">{flagHint.description}</div>
        </div>
      )}
    </div>
  );
}

export default App;
