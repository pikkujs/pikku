---
type: question
title: Should pikku new function default to the sessionless template?
description: pikku new function writes a sessionless function when no type is given, and writes only the file, so whether it is callable depends on wiring the command does not do
tags: cli, scaffold, functions, auth
---

# Should pikku new function default to the sessionless template?

`pikkuNewFunction` in `packages/cli/src/functions/commands/new-function.ts` takes a `type` that defaults to
`'sessionless'` (`new-function.ts:15`). The `default:` branch of the switch also writes the sessionless template,
so an unknown type falls through to it as well (`new-function.ts:70-71`).

The command writes the generated file and nothing else (`new-function.ts:93`). It does not wire the function, set
an auth field, or add a scope. Whether a newly generated function can be called by an anonymous caller depends on
the wiring that is added later, which this file does not show.

The question is whether a sessionless default is the right starting point for a new function. The code keeps it as
written, and the core scaffold decision in `packages/core/knowledge/decisions/security/a-scaffold-flag-says-a-surface-exists-not-who-may-call-it.md`
explains why scaffold flags carry no auth field.
