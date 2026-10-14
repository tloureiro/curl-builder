import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/renderer/App";

function mockShell() {
  const globalCurlOptions = [
    { id: "opt1", label: "Example routing", argsText: "--resolve 'example.com:443:192.0.2.10'" },
    { id: "opt2", label: "Multi Arg", argsText: "-H 'X-Opt: 1' --compressed" },
  ];
  const defaultFlags = { includeHeaders: true, followRedirects: false, silentAndShowErrors: true };
  return {
    detectBinaries: vi.fn(async () => ({
      curlPath: "curl",
      jqPath: "jq",
      grepPath: "grep",
      defaultTimeoutMs: 0,
      defaultCurlFlags: defaultFlags,
      shortcuts: { runRequest: "CtrlOrCmd+Enter", runTemplate: "CtrlOrCmd+Shift+T" },
      globalCurlOptions,
    })),
    loadWorkspaceConfig: vi.fn(async () => ({
      curlPath: "curl",
      defaultTimeoutMs: 0,
      defaultCurlFlags: defaultFlags,
      shortcuts: { runRequest: "CtrlOrCmd+Enter", runTemplate: "CtrlOrCmd+Shift+T" },
      globalCurlOptions,
    })),
    saveWorkspaceConfig: vi.fn(async () => {}),
    loadTemplates: vi.fn(async () => []),
    loadHistory: vi.fn(async () => []),
    saveTemplates: vi.fn(async () => {}),
    saveHistory: vi.fn(async () => {}),
    runCurl: vi.fn(async () => ({
      id: "exec1",
      curlCommand: "curl",
      startedAt: 0,
      finishedAt: 0,
      exitCode: 0,
      stdout: "{}",
      stderr: "",
    })),
    runJq: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    runGrep: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    killProcess: vi.fn(),
    writeRunLog: vi.fn(async () => "synthetic-run.log"),
  };
}

describe("template replay", () => {
  it("saves unresolved settings, reloads them, and replays with new values", async () => {
    const shell = mockShell();
    let saved: any[] = [];
    shell.saveTemplates.mockImplementation(async (templates) => { saved = structuredClone(templates); });
    shell.loadTemplates.mockImplementation(async () => structuredClone(saved) as any);
    (window as any).shell = shell;
    const first = render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    fireEvent.change(screen.getByPlaceholderText("https://"), { target: { value: "https://example.com/{{ITEM}}" } });
    fireEvent.change(screen.getByPlaceholderText(".data"), { target: { value: ".{{FIELD}}" } });
    fireEvent.change(screen.getByPlaceholderText("pattern or regex"), { target: { value: "{{MATCH}}" } });
    fireEvent.click(screen.getByRole("button", { name: /Multi Arg/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Reusable pipeline" } });
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    await screen.findByText("Template saved");
    expect(saved[0]).toMatchObject({
      urlTemplate: "https://example.com/{{ITEM}}", jqExpression: ".{{FIELD}}",
      grepPatterns: ["{{MATCH}}"], curlOptions: { extraArgs: ["-H", "X-Opt: 1", "--compressed"] },
    });
    expect(saved[0]).not.toHaveProperty("resolvedVariables");
    expect(shell.runCurl).not.toHaveBeenCalled();
    first.unmount();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /Reusable pipeline/i }));
    fireEvent.change(screen.getByLabelText("ITEM"), { target: { value: "again" } });
    fireEvent.change(screen.getByLabelText("FIELD"), { target: { value: "name" } });
    fireEvent.change(screen.getByLabelText("MATCH"), { target: { value: "beta" } });
    const dialog = screen.getByRole("dialog", { name: "Fill template vars" });
    fireEvent.click(dialog.querySelector("button:last-child")!);
    await waitFor(() => expect(shell.runCurl).toHaveBeenCalledTimes(1));
    expect(shell.runCurl.mock.calls[0][0].request.url).toBe("https://example.com/again");
    expect(shell.runJq).toHaveBeenCalledWith({ expr: ".name", jsonInput: "{}" });
    expect(shell.runGrep).toHaveBeenCalledWith(expect.objectContaining({ patterns: ["beta"] }));
    expect(screen.getByPlaceholderText("https://")).toHaveValue("https://example.com/{{ITEM}}");
  });

  it("keeps an unsuccessful save recoverable without claiming success", async () => {
    const shell = mockShell();
    shell.saveTemplates.mockRejectedValue(new Error("synthetic failure"));
    (window as any).shell = shell;
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Try again" } });
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    await screen.findByText(/Could not save template/);
    expect(screen.getByLabelText("Template name")).toHaveValue("Try again");
    expect(screen.queryByRole("button", { name: /Try again GET/i })).not.toBeInTheDocument();
    shell.saveTemplates.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
    await screen.findByText("Template saved");
  });

  it("shows a selected flag's description as the command changes", async () => {
    (window as any).shell = mockShell();
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    fireEvent.click(screen.getByRole("button", { name: /Multi Arg/i }));
    const command = screen.getByPlaceholderText("curl ... | jq ... | grep ...") as HTMLTextAreaElement;
    expect(command.value).toContain("--compressed");
    const start = command.value.indexOf("--compressed");
    command.focus();
    command.setSelectionRange(start, start + "--compressed".length);
    fireEvent.select(command);
    expect(screen.getByText("Request a compressed response and decompress it automatically.")).toBeInTheDocument();
    expect((window as any).shell.runCurl).not.toHaveBeenCalled();
  });

  it("executes the selected template instead of the previous request", async () => {
    const shell = mockShell();
    shell.loadTemplates.mockResolvedValue([{
      id: "saved", name: "Saved request", method: "POST",
      urlTemplate: "https://example.com/saved/{{ITEM}}",
      headersTemplate: [{ id: "h", name: "X-Item", value: "{{ITEM}}", enabled: true }],
      bodyTemplate: { mode: "raw", rawText: "item={{ITEM}}", formFields: [] },
    }] as any);
    (window as any).shell = shell;
    render(<App />);
    await screen.findByText("Saved request");
    fireEvent.change(screen.getByPlaceholderText("https://"), { target: { value: "https://example.com/previous" } });
    fireEvent.click(screen.getByText("Saved request"));
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(shell.runCurl).not.toHaveBeenCalled();
    const dialog = screen.getByText("Fill template vars").parentElement!;
    fireEvent.change(dialog.querySelector("input")!, { target: { value: "second" } });
    fireEvent.click(dialog.querySelector("button:last-child")!);
    await waitFor(() => expect(shell.runCurl).toHaveBeenCalledTimes(1));
    expect(shell.runCurl.mock.calls[0][0].request).toMatchObject({
      method: "POST", url: "https://example.com/saved/second",
      body: { rawText: "item=second" },
    });
  });
});

describe("command preview sync", () => {
  it("inserts a preset into the command and survives header edits", async () => {
    (window as any).shell = mockShell();
    const user = userEvent.setup();

    render(<App />);

    const insertBtn = await screen.findByRole("button", { name: /Example routing/i });
    await user.click(insertBtn);

    const cmdBox = await screen.findByPlaceholderText("curl ... | jq ... | grep ...");
    await user.type(cmdBox, " # note");
    expect(cmdBox.value).toContain("--resolve");

    await user.click(screen.getByText("+ Header"));
    const headerNames = screen.getAllByLabelText("Header name");
    const headerValues = screen.getAllByLabelText("Header value");
    await user.type(headerNames[headerNames.length - 1], "X-Test");
    await user.type(headerValues[headerValues.length - 1], "123");

    await waitFor(() => {
      expect(cmdBox.value).toContain("-H 'X-Test: 123'");
      expect(cmdBox.value).toContain("--resolve");
      expect(cmdBox.value).toContain("# note");
    });
  });

  it("allows inserting the same preset multiple times", async () => {
    (window as any).shell = mockShell();
    const user = userEvent.setup();

    render(<App />);

    const cmdBox = await screen.findByPlaceholderText("curl ... | jq ... | grep ...");
    const insertBtn = await screen.findByRole("button", { name: /Example routing/i });
    await user.click(insertBtn);
    await user.click(insertBtn);
    await user.click(insertBtn);

    await waitFor(() => {
      const value = cmdBox.value;
      expect(value.split("--resolve").length - 1).toBe(3);
    });
  });

  it("inserts multi-token preset as separate args", async () => {
    (window as any).shell = mockShell();
    const user = userEvent.setup();

    render(<App />);

    const insertBtn = await screen.findByRole("button", { name: /Multi Arg/i });
    await user.click(insertBtn);

    const cmdBox = await screen.findByPlaceholderText("curl ... | jq ... | grep ...");

    await waitFor(() => {
      const value = cmdBox.value;
      expect(value).toContain("-H 'X-Opt: 1'");
      expect(value).toContain("--compressed");
    });
  });

  it("keeps manual suffix when adding headers after inserts", async () => {
    (window as any).shell = mockShell();
    const user = userEvent.setup();

    render(<App />);

    const insertBtn = await screen.findByRole("button", { name: /Example routing/i });
    await user.click(insertBtn);

    const cmdBox = await screen.findByPlaceholderText("curl ... | jq ... | grep ...");
    await user.type(cmdBox, " # extra");

    await user.click(screen.getByText("+ Header"));
    const headerNames = screen.getAllByLabelText("Header name");
    const headerValues = screen.getAllByLabelText("Header value");
    await user.type(headerNames[headerNames.length - 1], "X-A");
    await user.type(headerValues[headerValues.length - 1], "1");

    await user.click(screen.getByText("+ Header"));
    const headerNames2 = screen.getAllByLabelText("Header name");
    const headerValues2 = screen.getAllByLabelText("Header value");
    await user.type(headerNames2[headerNames2.length - 1], "X-B");
    await user.type(headerValues2[headerValues2.length - 1], "2");

    await waitFor(() => {
      const value = cmdBox.value;
      expect(value).toContain("--resolve");
      expect(value).toContain("-H 'X-A: 1'");
      expect(value).toContain("-H 'X-B: 2'");
      expect(value).toContain("# extra");
    });
  });

  it("URL stays intact when inserting preset", async () => {
    (window as any).shell = mockShell();
    const user = userEvent.setup();

    render(<App />);

    const urlInput = await screen.findByPlaceholderText("https://");
    await user.clear(urlInput);
    await user.type(urlInput, "https://example.com");
    const insertBtn = await screen.findByRole("button", { name: /Example routing/i });
    await user.click(insertBtn);

    const cmdBox = await screen.findByPlaceholderText("curl ... | jq ... | grep ...");

    await waitFor(() => {
      expect(urlInput).toHaveValue("https://example.com");
      expect(cmdBox.value).toContain("https://example.com");
      expect(cmdBox.value.split("--resolve").length - 1).toBe(1);
    });
  });
});
describe("request execution regressions", () => {
  it("offers setup retry without overwriting settings after a failed saved-state read", async () => {
    const shell = mockShell();
    shell.loadTemplates.mockRejectedValueOnce(new Error("synthetic corrupt templates"));
    (window as any).shell = shell;
    render(<App />);
    await screen.findByRole("button", { name: "Retry setup" });
    expect(screen.getByRole("status")).toHaveTextContent("Existing files were not reset");
    expect(screen.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save as template" })).toBeDisabled();
    expect(shell.saveWorkspaceConfig).not.toHaveBeenCalled();
    expect(shell.saveTemplates).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry setup" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run", exact: true })).toBeEnabled());
    expect(shell.loadTemplates).toHaveBeenCalledTimes(2);
    expect(shell.saveWorkspaceConfig).toHaveBeenCalledTimes(1);
    expect(shell.saveTemplates).not.toHaveBeenCalled();
  });

  it("stops a failed jq stage before grep and allows a corrected rerun", async () => {
    const shell = mockShell();
    shell.runJq.mockResolvedValueOnce({ stdout: "", stderr: "synthetic invalid expression", exitCode: 3 });
    (window as any).shell = shell;
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    fireEvent.change(screen.getByPlaceholderText(".data"), { target: { value: "bad" } });
    fireEvent.change(screen.getByPlaceholderText("pattern or regex"), { target: { value: "match" } });
    fireEvent.click(screen.getByRole("button", { name: "Run", exact: true }));
    await screen.findByText("synthetic invalid expression");
    expect(shell.runGrep).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
    fireEvent.change(screen.getByPlaceholderText(".data"), { target: { value: "." } });
    fireEvent.click(screen.getByRole("button", { name: "Run", exact: true }));
    await waitFor(() => expect(shell.runGrep).toHaveBeenCalledTimes(1));
  });

  it("reports grep no-match as an ordinary outcome", async () => {
    const shell = mockShell();
    shell.runGrep.mockResolvedValue({ stdout: "", stderr: "", exitCode: 1 });
    (window as any).shell = shell;
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    fireEvent.change(screen.getByPlaceholderText("pattern or regex"), { target: { value: "absent" } });
    fireEvent.click(screen.getByRole("button", { name: "Run", exact: true }));
    await screen.findByText("grep/rg: no matches");
    expect(screen.getByRole("button", { name: "Run", exact: true })).toBeEnabled();
  });

  it("keeps saving and execution disabled until stored templates are loaded", async () => {
    const shell = mockShell();
    let finishLoading!: (value: any) => void;
    shell.loadTemplates.mockImplementation(() => new Promise((resolve) => { finishLoading = resolve; }));
    (window as any).shell = shell;
    render(<App />);
    await waitFor(() => expect(shell.loadTemplates).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Save as template" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    expect(shell.runCurl).not.toHaveBeenCalled();
    finishLoading([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Run", exact: true })).toBeEnabled());
  });

  it("shows a missing curl error and does not filter a failed execution", async () => {
    const shell = mockShell();
    shell.runCurl.mockResolvedValue({ id: "failed", curlCommand: "curl", startedAt: 0,
      finishedAt: 1, exitCode: null, stdout: "", stderr: "", errorMessage: "spawn synthetic-missing-curl ENOENT" } as any);
    (window as any).shell = shell;
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    fireEvent.change(screen.getByPlaceholderText(".data"), { target: { value: "." } });
    fireEvent.click(screen.getByRole("button", { name: "Run", exact: true }));
    await waitFor(() => expect(shell.runCurl).toHaveBeenCalledTimes(1));
    expect(shell.runJq).not.toHaveBeenCalled();
    expect(screen.getByText("spawn synthetic-missing-curl ENOENT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "raw (curl only)" }));
    expect(screen.getByText("spawn synthetic-missing-curl ENOENT")).toBeInTheDocument();
    expect(shell.runCurl).toHaveBeenCalledTimes(1);
  });

  it("preserves empty jq output when passing it to grep", async () => {
    const shell = mockShell();
    (window as any).shell = shell;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    await user.type(screen.getByPlaceholderText(".data"), "empty");
    await user.type(screen.getByPlaceholderText("pattern or regex"), "match");
    await user.click(screen.getByRole("button", { name: "Run", exact: true }));
    await waitFor(() => expect(shell.runGrep).toHaveBeenCalledWith(
      expect.objectContaining({ inputText: "" })
    ));
    expect(shell.runCurl).toHaveBeenCalledTimes(1);
  });

  it("passes the captured body to jq while retaining headers in raw output", async () => {
    const shell = mockShell();
    shell.runCurl.mockResolvedValue({ id: "exec1", curlCommand: "curl", startedAt: 0,
      finishedAt: 1, exitCode: 0, stdout: 'HTTP/1.1 200 OK\r\n\r\n{}', stderr: "",
      responseBody: "{}" } as any);
    (window as any).shell = shell;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    await user.type(screen.getByPlaceholderText(".data"), ".");
    await user.click(screen.getByRole("button", { name: "Run", exact: true }));
    await waitFor(() => expect(shell.runJq).toHaveBeenCalledWith({ expr: ".", jsonInput: "{}" }));
    await user.click(screen.getByRole("button", { name: "raw (curl only)" }));
    expect(screen.getByText(/HTTP\/1.1 200 OK/)).toBeInTheDocument();
    expect(shell.runCurl).toHaveBeenCalledTimes(1);
  });

  it("never sends a request when opening raw before Run", async () => {
    const shell = mockShell();
    (window as any).shell = shell;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    await user.click(screen.getByRole("button", { name: "raw (curl only)" }));
    expect(shell.runCurl).not.toHaveBeenCalled();
  });

  it("does not repeat a POST when switching tabs, even after an edit", async () => {
    const shell = mockShell();
    (window as any).shell = shell;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    await user.selectOptions(screen.getAllByRole("combobox")[0], "POST");
    await user.click(screen.getByRole("button", { name: "Run", exact: true }));
    await waitFor(() => expect(shell.runCurl).toHaveBeenCalledTimes(1));
    expect(shell.runCurl.mock.calls[0][0].request.method).toBe("POST");
    await user.type(screen.getByPlaceholderText("https://"), "/edited");
    await user.click(screen.getByRole("button", { name: "raw (curl only)" }));
    await user.click(screen.getByRole("button", { name: "chain" }));
    await user.click(screen.getByRole("button", { name: "raw (curl only)" }));
    expect(shell.runCurl).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Run", exact: true }));
    await waitFor(() => expect(shell.runCurl).toHaveBeenCalledTimes(2));
  });

  it("sends cookie pairs without Set-Cookie attributes", async () => {
    const shell = mockShell();
    (window as any).shell = shell;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    await user.type(screen.getByPlaceholderText("name"), "sample");
    await user.type(screen.getByPlaceholderText("value"), "demo");
    await user.type(screen.getByPlaceholderText("Path"), "/");
    await user.type(screen.getByPlaceholderText("Domain"), "example.com");
    await user.click(screen.getByRole("checkbox", { name: "Secure", exact: true }));
    await user.click(screen.getByRole("checkbox", { name: "HttpOnly", exact: true }));
    await user.click(screen.getByRole("button", { name: "Run", exact: true }));
    await waitFor(() => expect(shell.runCurl).toHaveBeenCalledTimes(1));
    expect(shell.runCurl.mock.calls[0][0].request.headers).toContainEqual(
      expect.objectContaining({ name: "Cookie", value: "sample=demo" })
    );
  });

  it("preserves a manually entered Cookie header when the helper is empty", async () => {
    const shell = mockShell();
    (window as any).shell = shell;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    await user.type(screen.getAllByLabelText("Header name")[0], "Cookie");
    await user.type(screen.getAllByLabelText("Header value")[0], "sample=manual");
    await user.click(screen.getByRole("button", { name: "Run", exact: true }));
    await waitFor(() => expect(shell.runCurl).toHaveBeenCalledTimes(1));
    expect(shell.runCurl.mock.calls[0][0].request.headers).toContainEqual(
      expect.objectContaining({ name: "Cookie", value: "sample=manual" })
    );
  });
});

describe("request privacy", () => {
  it("does not persist history or log request values", async () => {
    const shell = mockShell();
    (window as any).shell = shell;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    fireEvent.change(screen.getByPlaceholderText("https://"), { target: { value: "https://example.com/synthetic-private-path?token=synthetic-private-query" } });
    fireEvent.change(screen.getAllByLabelText("Header name")[0], { target: { value: "Authorization" } });
    fireEvent.change(screen.getAllByLabelText("Header value")[0], { target: { value: "Bearer {{TOKEN}}" } });
    await user.click(screen.getByRole("button", { name: "Run", exact: true }));
    const prompt = screen.getByText("Provide variable values").parentElement!;
    fireEvent.change(prompt.querySelector("input")!, { target: { value: "synthetic-prompt-secret" } });
    await user.click(screen.getAllByRole("button", { name: "Run", exact: true }).at(-1)!);
    await waitFor(() => expect(shell.runCurl).toHaveBeenCalledTimes(1));
    expect(shell.loadHistory).not.toHaveBeenCalled();
    expect(shell.saveHistory).not.toHaveBeenCalled();
    const logs = shell.writeRunLog.mock.calls.map((call) => call[0]).join("\n");
    expect(logs).not.toContain("synthetic-prompt-secret");
    expect(logs).not.toContain("synthetic-private");
    expect(logs).not.toContain("Authorization");
    await user.click(screen.getByText("GET · https://example.com/synthetic-private-path?token=synthetic-private-query"));
    expect(screen.getAllByLabelText("Header value")[0]).toHaveValue("Bearer {{TOKEN}}");
    await user.click(screen.getByRole("button", { name: "Run", exact: true }));
    expect(screen.getByText("Provide variable values").parentElement!.querySelector("input")).toHaveValue("");
  });

  it("omits headers from the copyable jq pipeline", async () => {
    (window as any).shell = mockShell();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: /Example routing/i });
    await user.type(screen.getByPlaceholderText(".data"), ".");
    const command = screen.getByPlaceholderText("curl ... | jq ... | grep ...") as HTMLTextAreaElement;
    expect(command.value).toContain("--no-include");
    expect(command.value).not.toMatch(/ -i(?: |$)/);
    expect(command.value).toContain("| jq");
  });
});
