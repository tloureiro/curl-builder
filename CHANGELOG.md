# Changelog

## Unreleased

The entries below describe local work awaiting a release. The package's current
0.1.0 version is prototype metadata; no release has been created for this cleanup.

### Changed

- Capture response headers separately so jq receives the body.
- Reuse the same curl response in the raw tab; viewing it does not repeat a request.
- Keep history in memory, without resolved prompt values, and place runtime files
  outside the checkout. Existing repo-root data is not imported automatically.
- Keep request values out of run.log.
- Fix empty-input/filter handling, cookie pairs, grep engine selection, and clean
  development startup.

- Replace the unsupported native template-name prompt with a recoverable in-app save.
- Replay the selected template snapshot; preserve options, cookies, filters and
  placeholders across saves, and support keyboard activation of template entries.

- Keep startup/read failures recoverable without resetting files or enabling saves
  before the stored collection has loaded. Show command/filter failures and stop
  downstream stages; distinguish grep no-match from failure.

- Enable Electron sandbox/CSP/navigation and IPC sender/payload boundaries.
- Scope execution to HTTP(S), reviewed curl options and stdin filters; send literal
  body/form values, sanitize subprocess environments, and bound captures/time.
- Replace saved JSON/logs atomically with private file modes; validate saved data.
- Remove unused Monaco/Zustand/packaging dependencies; update Electron, Vitest,
  Vite, React plugin and concurrently, plus compatible transitive fixes.
- Require Node 22.12 on 22.x or Node 24+ for the updated toolchain.

### Added

- Synthetic regressions, full-process restart/storage-recovery desktop checks,
  and a generated demo screenshot.
- Product scope, architecture, contribution and coding-agent documentation.
- A shared check command, prepared CI, optional whitespace hook, and dependency-update configuration.

### Known limits

Broader UX review, initial-commit verification, license/source attribution and
packaged/cross-platform distribution remain open. Runtime boundaries and dated
dependency checks are documented in [security](docs/SECURITY.md). CI and
Dependabot configuration have not been exercised on GitHub. See
[product scope](PRODUCT.md) and [maintenance guidance](docs/MAINTENANCE.md).
