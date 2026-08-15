---
type: decision
title: CLI option names are camelCase in state and kebab-case on the command line
description: Option keys match the function's input field names so they can be plucked by schema, and are converted to kebab only for display and parsing
tags: cli
---

# CLI option names are camelCase in state and kebab-case on the command line

Every option key in `CLIOptions`, `CLICommandMeta.options` and the parsed
`ParsedCommand.options` is camelCase, because it must line up with a field name
on the command function's input type — that is what makes
`pluckCLIData` in `packages/core/src/wirings/cli/cli-runner.ts` able to select
fields by schema property name. Users type kebab-case.

`toCamelCase` and `toKebabCase` in
`packages/core/src/wirings/cli/command-parser.ts` are the only two points where
the conversion happens. The parser normalises every incoming `--from-plan` to
`fromPlan` on the way in, and both `formatOptions` (help text) and the
"Missing required option" / "Invalid value for" errors render back to kebab on
the way out. `suggestOption` deliberately compares the typed string against
_both_ forms, so `--autoApply` and `--auto-apply` both find `autoApply`.

**What this rules out:** storing option keys kebab-cased anywhere in CLI state or
metadata — the schema pluck would then match nothing and every option would be
dropped. It also rules out emitting camelCase in help text or error messages,
which would tell users to type a flag spelling that works only by accident.
