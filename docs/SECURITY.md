# Execution and local-data boundaries

This is a personal HTTP request/filtering prototype. These boundaries reduce
unnecessary privilege; they do not sandbox the whole application or make it a
credential vault. Use trusted local binaries and review commands before Run.

## Renderer and IPC

The renderer uses Electron sandboxing, context isolation, disabled Node integration
and web security. It loads the bundled local document, or the exact configured
loopback development document. Navigation, popups, webviews and permission requests
are denied. Production scripts load from the application; development adds a
generated nonce for Vite's refresh preamble and loopback-only HMR connections.
Inline styles remain allowed for the existing React interface; inline scripts and
eval are not enabled. Responses are displayed as text.

Every IPC channel checks the active window, top frame and exact document URL.
Execution, settings and saved templates are validated at runtime. Per-request
executable overrides are rejected; configured paths must name curl, jq, grep or rg
(on PATH or at an absolute path). Those installed executables and the developer
server remain trusted components. Naming checks do not verify executable contents.
The main process and subprocesses still run with the user's normal privileges.

## CLI policy

One explicit HTTP/HTTPS URL is supported. The preview includes `--disable` first
to suppress implicit curl configuration, `--globoff` for one literal URL, and
protocol restrictions for requests/redirects. Internal header capture is additional
plumbing. A reviewed option set is defined in
[cliPolicy.ts](../src/shared/cliPolicy.ts); unsupported options fail with an error.

Output files, additional URLs/transfers, file-backed headers/data/cookies and
configuration files are excluded. Body controls use literal raw data and multipart
form strings, so `@...` is text rather than a file to read. File uploads are outside
scope. Grep/rg match stdin with reviewed flags, and jq module loading is excluded.
The module check is conservative; ambiguous interpolated expressions may be rejected.
Use the supplied response rather than local-file imports. Do not treat the
copyable preview as a general-purpose safe shell command for unrelated input.

Subprocesses receive only basic PATH/locale/temp/system variables. Credentials,
proxy variables, HOME and SSL key-log settings are not inherited; configure a
needed proxy explicitly. This changes implicit terminal environment behavior.
Captured stdout/stderr is capped at 10 MiB per stage. Saved JSON is capped at 8 MiB;
body text at 1 MiB of characters; captured headers are checked against 1 MiB before
reading. Filters default to 30 seconds when no positive timeout is configured and
are capped at 60 seconds. Curl request timeouts remain opt-in, with Kill available.
These limits are prototype safeguards, not streaming/download or complete CPU/disk
resource isolation. Header capture still uses a short-lived local file.

## Persistence and secrets

Config, explicit templates and metadata-only run.log use the chosen application
data directory. JSON/log replacement is atomic and creates mode-0600 files; newly
created data directories request mode 0700. Existing directories are not chmodded.
Session history retains unresolved inputs and does not survive restart. Read
failures preserve files and support retry after repair. Saved-file and validation
errors omit input values from rejected IPC logs; renderer console messages are not
forwarded wholesale into main-process logs. The logging IPC accepts defined
metadata lines rather than arbitrary text.

Literal values explicitly saved in config/templates remain plaintext. Resolved
values/responses live in memory, and CLI arguments can be visible to local process
inspection. Placeholders avoid automatic persistence, not all local exposure.
Temporary headers can contain sensitive response values; crashes may bypass normal
cleanup. Never use this as encrypted storage or promise cross-platform hardening.

## Dependencies and reporting

The locked tree's npm audit returned zero known advisories on 2026-10-25 after
the dependency review below. This is a dated registry result, not proof
that Electron's embedded dependencies, system CLI tools or application code have
no vulnerabilities. Electron is the application runtime even though npm marks
it as a development dependency; `npm audit --omit=dev` excludes that runtime.
Run `npm audit` again before distribution and after dependency changes; use the
[maintenance workflow](MAINTENANCE.md) and relevant behavioral/desktop checks.

### Dependency review: 2026-10-25

| Component | Previous lock | Selected lock | Reason |
| --- | --- | --- | --- |
| Electron runtime | 44.7.2 | 44.9.3 | Certificate mitigation starts at 44.9.1; 44.9.3 also includes later upstream fixes |
| Undici npm package | 7.30.0 | 7.30.1 | Fixes EventSource memory exhaustion, mixed-case integrity bypass and excessive content-encoding crash |
| Vitest and its mocker | 4.1.11 | 4.1.12 | Backports manual-mock injection and Windows redirect-traversal fixes |

The update described in the [Electron certificate advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)
blocks compromised eMudhra intermediates in both Chromium networking and Node
TLS/HTTPS/fetch. A network interceptor with a certificate issued through those
intermediates could impersonate a server. The advisory requires updating Electron;
renderer sandboxing does not repair certificate verification. The selected
[44.9.3 release](https://releases.electronjs.org/release/v44.9.3) stays on the existing
major and includes the mitigation introduced in 44.9.1.

The npm Undici path is `electron → @electron/get@5.1.0 → undici`. It is an optional
dependency used for downloader proxy support. The downloader itself uses the
installing Node's built-in fetch, so updating this package does not update either
the host Node or Electron's embedded fetch. The three npm advisories are
[EventSource memory exhaustion](https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685),
[integrity bypass](https://github.com/nodejs/undici/security/advisories/GHSA-f72v-6w45-q472)
and [content-encoding crash](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c).
All are fixed on this npm major by 7.30.1; no override or direct runtime dependency
was added.

Vitest's [manual-mock injection](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8)
and [Windows traversal](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp)
require a reachable Vite server registering the affected mocker WebSocket handlers.
This project runs jsdom tests with `vitest run`; its application Vite config does
not register `mockerPlugin` or `interceptorPlugin`. Loopback binding reduces network
reachability but is not the fix. Vitest 4.1.12 updates its matching internal packages
and remains compatible with Vite 7.3.7 and jsdom 26.1.0. The chosen packages' Node
engine requirements fit the project's declared Node range.

**Embedded runtime limit:** the installed Electron 44.9.3 reports Node 24.22.0,
Chromium 152.0.7977.167 and embedded Undici 7.29.1. A separate synthetic loopback
probe confirmed that its built-in fetch accepts a mismatched SHA256 integrity
value with an uppercase algorithm, while npm Undici 7.30.1 rejects it. The embedded
copy therefore still exhibits the integrity advisory; a zero npm audit does not
close it. [Electron 45.0.0](https://releases.electronjs.org/release/v45.0.0) also
advertises Node 24.22.0, so a major upgrade alone
is not evidence of an embedded fix. Recheck upstream Electron before introducing
Node fetch/EventSource or distributing the app. Keep the host Node patched too;
the [October 21 Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
updates bundled Undici separately. This review did not change the host Node.

Current source does not use Node fetch/EventSource or Node TLS networking for
requests. The bundled renderer has `connect-src 'none'`, and development permits
only the configured loopback server. Requests execute in system curl through
validated IPC and argument arrays with `shell: false`; jq/grep receive stdin and
a restricted environment. These boundaries limit the reachable paths; they do
not patch embedded libraries. System curl's TLS implementation and certificate
store are independent of Electron and were not certified by this review.

Verification on macOS with host Node 24.14.1: `npm ci`, `npm run check` (typecheck,
75 tests and build), full `npm audit` and `npm run test:desktop` passed. The desktop
check exercised the actual sandboxed renderer/preload, CSP, rejected IPC/window
actions, curl/jq/grep, three-process restart/replay and synthetic storage recovery;
the refreshed screenshot was inspected. The runtime version and loopback integrity
probes used Electron's Node mode. No compromised-certificate handshake, other-platform
desktop support or exhaustive security audit was tested.

Do not include credentials, private endpoints, request/response values or personal
config in public reports. Review current files and Git history before sharing a
repository; ignoring a currently tracked file does not remove its older revisions.
No public installer, independent penetration test or wider-platform validation is
claimed. Existing personal/legacy data is never imported automatically.
