# Product scope

curl-builder is a personal tool for learning curl flags and templating common
commands. The visual builder makes options easier to explore while keeping the
resulting command visible. Saved templates and argument presets support reuse.

The documented use case is personal learning and command reuse. Broader usefulness
to other developers is a hypothesis; no external-user research or adoption
measurements are documented here.

## Primary journey

1. Start with a common request or paste a known curl command.
2. Explore an option, inspect its description, and see how it changes the command.
3. Execute deliberately, inspect the response, and adjust the request.
4. Save a reusable template or argument preset. Use placeholders for values that
   change between runs, particularly credentials.
5. Return to the template later and supply values for that execution.

The command remains inspectable throughout. A successful request is useful, but
understanding and reusing it are the intended product outcomes.

## Scope and alternatives

A terminal is already effective for familiar commands and arbitrary shell
pipelines. This tool adds a visual editing/learning surface around the installed
CLI tools. It is not a full shell, curl manual, or cloud API workspace.

| Current capability | Boundary |
| --- | --- |
| Builder and best-effort command parsing | Not a complete shell parser or full curl grammar |
| Descriptions for recognized selected flags | Not exhaustive curl documentation |
| Saved templates, variables, and reusable argument presets | Save, full process restart and replay checked locally; prototype/platform limits remain |
| curl → jq → grep/rg | HTTP(S), one transfer and stdin filters; file access/output and extra transfers are rejected |
| Captured raw and filtered response | Viewing output does not send a request |
| Session history | Does not survive app restarts or store resolved prompt values |

Cloud accounts, request synchronization, collaborative collections, credential
vaults, installers, and commercial support are outside the current scope. Keeping
this small leaves attention for command comprehension, accurate preview, and reuse.

## Decisions visible in the product

- **CLI execution:** use installed tools rather than emulate their behavior.
  This keeps the workflow familiar but introduces local tool/version prerequisites.
- **Explicit reruns:** reusing the captured response prevents a viewing action
  from repeating a POST. Run is the explicit execution control.
- **Session history:** avoid automatic disk persistence of request/prompt values;
  accept losing recent-history convenience after restart. Explicitly saved
  templates/config can still contain literal values entered by the user.
- **Local prototype:** demonstrate the workflow before adding packaging or a
  larger feature set. Distribution/security work remains unfinished.

These describe the current design and the October 2026 cleanup. They do not
reconstruct the original author's undocumented reasoning.

## Next validation and priorities

The October 14 local checks cover recognized flag descriptions, changed preview,
named template saving, disk persistence across renderer reload and full process restart, variable prompting,
and replay of the selected template instead of the previously edited request.
Options, cookies, and filters survive template serialization; unresolved inputs
stay reusable and execution-time variable values are excluded from saved metadata.
Synthetic config/template read failures are preserved and recover through retry.
Curl/jq failures stop downstream filtering with useful error output. These checks establish behavior,
not measured learning gains or usability with other people.

The automated baseline also verifies filtering, header separation, explicit reruns,
empty pipelines, cookie construction, local-data behavior, and recoverable save failure.

The October 14 security pass enables sandbox/CSP/sender/payload checks, scopes CLI
capabilities, replaces saved files atomically and updates the locked dependencies
(zero npm advisories at that date). See [security](docs/SECURITY.md) for limits.
This source edition excludes legacy runtime config and uses synthetic routing
examples and clean source history. ISC and React runtime notices are included.
A focused macOS keyboard/recovery pass checks native dialogs, focus containment/
restoration, Escape/Enter, template/history activation, save/retry, missing curl,
and existing startup/empty/filter failures. It does not establish screen-reader,
other-platform or external-user usability. Any packaged distribution needs its
own platform/license review. These are limits, not promised releases or dates.

Success checks should remain concrete: can a user explain a newly explored flag,
reuse a template with different values, and predict exactly when a request will
be sent? Manual observation is sufficient initially; there is no product telemetry
or evidence of measured learning/time savings.
