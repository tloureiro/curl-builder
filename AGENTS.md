# Agent instructions

## Start here

Read README.md, PRODUCT.md, and docs/ARCHITECTURE.md, then inspect only files
relevant to the change. Check the current Git diff before editing and preserve
unrelated work. Ask for missing product intent when it changes the outcome;
resolve routine implementation details within the requested scope.

The product's primary workflow is learning curl flags and reusing common commands.
Prefer changes that improve command understanding, accurate preview, explicit
execution, or template reuse. Avoid speculative features and broad rewrites.

## Setup and verification

- Install the locked tree with `npm ci`; use the Node range in package.json.
- Shared source check: `npm run check` (typecheck, tests, build); CI uses it too.
- For UI/preload/IPC/execution changes, build then run `npm run test:desktop`.
  Its Node controller launches/closes independent Electron processes, uses a
  synthetic loopback fixture and owned temporary data, and updates
  docs/synthetic-workflow.png. It checks full restart/replay and unreadable-file
  recovery. Inspect the resulting image; never use personal files for failure tests.
- `npm run dev` serves only 127.0.0.1:5173 and waits for main.js/preload.js.
- For docs-only edits, check local links and script names; application tests need
  not be repeated unless behavior/setup changed. No lint script exists.
- Add regressions for meaningful bugs. Use synthetic local fixtures; never a real
  account, customer endpoint, credential, or saved request collection.
- Record actual check results and limits. Owner reports Checks passed for 6b41de4;
  verify each later commit separately. No passing badge or platform claim from config alone.

## Code boundaries

- src/shared: pure argument/parsing/template helpers and types; no Electron APIs
  or filesystem writes. Follow existing TypeScript style and strict source checking.
- src/main: privileged execution, local storage, and IPC. Use subprocess argument
  arrays with `shell: false`; do not execute the preview as a shell command.
- src/preload: the explicit renderer/main API; update its types and consumers
  together when changing the contract.
- src/renderer: product state and UI. Extract narrow helpers where useful; preserve
  interaction behavior rather than rewriting the large component all at once.

## Behavior that must survive changes

- Curl defaults: -sS -i; redirects/timeouts are off unless requested.
- jq runs automatically when an expression is supplied and receives body only,
  while raw output may retain separately captured headers. Preserve empty stage
  output; never fall back to upstream output because a filter emitted no text.
- Raw and chain tabs reuse one response. Viewing output never sends a request;
  Run is the explicit repeat action, especially for POST/PUT/PATCH/DELETE.
- Cookie request headers contain enabled name/value pairs, not Set-Cookie
  attributes. Preserve manual Cookie headers when the helper is empty.
- Grep/rg previews and execution select the same engine and matching arguments.
- Command editing is best-effort parsing; idle input mirrors the built pipeline.
- Setup/read failures keep saved files intact; disable execution/saving/settings
  until setup succeeds, and support retry after the user repairs the data.
- Curl/jq failures stop downstream filtering; show actionable errors. Grep exit 1
  means no matches. Saved-file IPC errors omit original parser text.
- Recognized flag selection shows its description. Keep learning behavior useful.
- Presets insert argument snippets; templates retain unresolved request structure,
  curl options, cookies and filters, omitting execution-time variable values. Execute
  the selected template snapshot directly rather than scheduling a stale handler. Placeholders
  trigger value prompting, and active-request values can prefill later runs.
- Use native modal dialogs so focus/background restrictions and restoration survive.
  Escape cancels, Enter submits the active form; global Run shortcut stays inactive
  inside dialogs. History keyboard activation only loads; it never executes.
- Template/config save errors remain visible and retryable without discarding edits.
- Body controls appear for POST/PUT/PATCH. Zoom shortcuts are Ctrl/Cmd +, -, 0.
- The renderer's fallback configuration still renders when preload is unavailable;
  it does not establish a working execution bridge.

## Data and safety

Initialize storage before use. Config/templates and metadata-only run.log belong
in Electron userData or an absolute CURL_BUILDER_DATA_DIR, never the checkout.
History is session-only and keeps unresolved inputs with prompt values cleared.
Do not log URLs, commands, header/cookie/body values, filters, or exception text.
Explicitly saved config/templates can contain user-entered literals; do not call
this encrypted storage or a credential vault.

Do not open, import, overwrite, or delete personal legacy config/history/templates,
logs, responses, or datasets to make a test pass. Runtime config.json, templates,
history and logs stay ignored; config.example.json is synthetic. Use owned temporary data and clean
only files/processes created by the check. Never publish/upload, change visibility,
rewrite history, or contact external accounts without explicit authorization.

Read docs/SECURITY.md before changing execution or trust boundaries. Preserve
sandboxing/context isolation, strict renderer-document/top-frame checks, runtime
payload validation, HTTP(S)/CLI capability limits, metadata-only logging and atomic
private writes. A new supported CLI option needs a concrete workflow and a review
of file/network/process effects; do not weaken a guard just to accept a pasted command.
Subprocess environments omit secrets/proxies/HOME; data/output/filter-time limits
are intentional. Main/system binaries remain privileged and trusted. Current/history
publication content and license/source attribution require deliberate review when changed.
Do not claim an exhaustive security audit or all-platform hardening.

## Lightweight automation

Read docs/MAINTENANCE.md before changing versions, hooks, dependency updates,
or CI. Keep package/lock versions aligned and changelog entries under Unreleased
until a real release. Respect existing hook configuration; hooks are opt-in and
must stay fast, read-only, and independent of package installation. Reuse existing
check commands. Preserve manual review of dependency/version changes. No new
release/tag/publish automation or tooling framework is needed for this prototype.

## Finish

Keep README/product/architecture docs consistent with changed behavior. Summarize
user-visible impact, rationale, tests actually run, and remaining gaps. Keep
claims about user feedback, metrics, attribution, and historical decisions accurate.
Use CONTRIBUTING.md and the PR template for review details.
