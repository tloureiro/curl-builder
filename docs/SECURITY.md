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

The locked tree's npm audit returned zero known advisories on 2026-10-14 after
updates and removing unused packages. This is a dated registry result, not proof
that Electron, system CLI tools or application code have no vulnerabilities.
Run `npm audit` again before distribution and after dependency changes; use the
[maintenance workflow](MAINTENANCE.md) and relevant behavioral/desktop checks.

Do not include credentials, private endpoints, request/response values or personal
config in public reports. Review current files and Git history before sharing a
repository; ignoring a currently tracked file does not remove its older revisions.
No public installer, independent penetration test or wider-platform validation is
claimed. Existing personal/legacy data is never imported automatically.
