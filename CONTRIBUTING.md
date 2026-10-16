# Working on curl-builder

This is a personal local prototype. A contribution should improve the learning
or command-reuse workflow described in [PRODUCT.md](PRODUCT.md). Issue/PR templates
are available if the repository is shared; no response-time or release commitment
is implied.

Read [README.md](README.md) for setup and [architecture](docs/ARCHITECTURE.md) for
entry points. Coding agents should also read [AGENTS.md](AGENTS.md).

## A useful change

Describe the task being improved, the current behavior, and the intended result.
Keep the scope small and explain any change to execution, stored data, or user
interaction. Use synthetic examples and a loopback fixture for request testing.
A maintainer should be able to reproduce the behavior without your settings,
accounts, or a private endpoint.

Preserve unrelated edits. Follow the existing TypeScript/React style; keep pure
argument/parsing helpers in src/shared and privileged execution/storage in
src/main. Avoid command-string shell execution. Do not add dependencies or features
without explaining their role in the product workflow.

## Checks

For source changes, run:

```sh
npm run check
```

For renderer/preload/IPC/execution changes, also run after building:

```sh
npm run test:desktop
```

The desktop check uses independent Electron processes, isolated synthetic data
and loopback requests to check the main journey, restart and storage recovery.
It updates the screenshot and exits. Inspect any screenshot change before
including it. For docs-only changes, verify links and command names; do not rerun
application suites unless a behavior or setup claim changed.

The local baseline was verified on macOS with Node 24.14.1 on 2026-10-14. The
[CI workflow](.github/workflows/checks.yml) prepares the same non-GUI checks on
Ubuntu/Node 24. The owner reports Checks passed for commit 6b41de4;
new local changes still need their own remote result. It does not establish Linux
desktop support. There is no configured lint command; do not claim one passed.

## Maintenance conventions

See [maintenance guidance](docs/MAINTENANCE.md) for the optional fast Git hook,
dependency updates, and manual version/release convention. Keep change notes in
[CHANGELOG.md](CHANGELOG.md)'s Unreleased section until an actual release is made.
Hooks are opt-in and preserve existing custom setups.

## Review

Describe what changed for the user, why it is in scope, which checks actually ran,
and what remains unverified. Add a regression that reproduces a meaningful bug;
avoid tests that merely restate implementation details. Update docs when changing
scope, startup, commands, storage, or execution semantics.

Describe the review and verification performed. Keep claims about user research,
adoption, performance results, and historical rationale supported by evidence.

Before committing, inspect the diff for personal settings, credentials, request
bodies/responses, account/customer identifiers, and temporary artifacts. The
source and history need review before publication. Keep personal runtime files
ignored, follow the [ISC license](LICENSE), and retain applicable
[third-party notices](THIRD_PARTY_NOTICES.md). Follow
[execution/data limits](docs/SECURITY.md). Do not place confidential reports in
public issue text.
