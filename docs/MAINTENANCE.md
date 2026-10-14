# Checks, hooks, dependencies, and versions

## One check entry point

```sh
npm run check
```

This runs typecheck, tests, and build in order and stops at a failure. CI uses the
same command. Run the separate desktop smoke for UI/preload/IPC/execution changes;
its Node controller opens independent app processes and refreshes the synthetic
screenshot. It also checks restart/replay and unreadable-file recovery. CI's non-GUI checks do
not establish desktop support on its runner platform.

## Optional fast Git hook

[.githooks/pre-commit](../.githooks/pre-commit) checks whitespace and conflict markers
in staged changes using `git diff --cached --check`. It does not reformat files,
change the index, run the desktop app, or install packages. Full checks remain
explicit and in CI.

Hook activation is opt-in. If you already use custom hooks or core.hooksPath,
integrate this check with them rather than replacing their configuration. Otherwise,
from the repo root, inspect your effective configuration and enable locally:

```sh
git config --get core.hooksPath
# Only if no existing custom hook setup needs preserving:
git config --local core.hooksPath .githooks
```

To undo this project's explicit opt-in, remove its local core.hooksPath setting
with `git config --local --unset core.hooksPath`. That restores Git's effective
fallback, including any global configuration. The repository does not activate
hooks through npm installation. Hooks are convenience checks, not a CI substitute.

## Dependencies

[Dependabot configuration](../.github/dependabot.yml) proposes monthly npm and
GitHub Actions updates when the configuration is active on GitHub. Compatible
npm minor/patch updates are grouped; major changes remain separate. Open version
update PRs are limited to three for npm and two for Actions. Security updates have
separate GitHub behavior and need timely review; the monthly cadence is for version
updates, not an instruction to defer security fixes.

Review proposed changes and run the meaningful checks before merging. The October 14 update removed unused packages and refreshed Electron/tooling and
compatible transitive dependencies. The locked tree returned zero known npm
advisories that day; future findings still require manual triage. The configuration has not run remotely;
there is no configured automatic merge or package publication.

## Version and release convention

Keep package.json and package-lock.json versions consistent. The current 0.1.0
is prototype metadata. Record actual pending changes under **Unreleased** in
[CHANGELOG.md](../CHANGELOG.md); do not invent older releases or measured outcomes.

For future 0.x releases, use a patch for compatible fixes and a minor increment
for features or incompatible workflow/data changes. Explicitly describe any
compatibility change while the interface remains experimental. A future 1.0
would mean a deliberately supported stable contract, not a presentation milestone.

When preparing a real release, choose the version, update both manifests using
`npm version <chosen-version> --no-git-tag-version`, update the changelog, and run
checks plus the relevant desktop journey. This command updates version metadata
without creating a Git commit/tag; review any version lifecycle scripts before use.
Commit/tag creation and any GitHub release happen as deliberate maintainer actions.
Use a consistent v-prefixed tag matching the version when that release actually
exists. A Git tag is not evidence of an installer or published npm package.
