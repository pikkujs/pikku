---
type: decision
title: A persona that cannot run where it says stops generation
description: pikku persona generation throws on environment errors before writing any file, and removes the personas secrets file when no personas are declared
tags: cli, personas, codegen, environments
---

# A persona that cannot run where it says stops generation

`pikkuPersonas` in `packages/cli/src/functions/wirings/personas/pikku-command-personas.ts`
checks every persona against the configured environments before it writes anything
(`pikku-command-personas.ts:35-43`). Any error is thrown, and the comment says generating
the file anyway would leave a `.pikku` that typechecks while lying (`pikku-command-personas.ts:35-37`).

The secrets file follows the personas. It is written when at least one persona exists
(`pikku-command-personas.ts:59-61`). When the last persona is removed the file is deleted
(`pikku-command-personas.ts:62-64`), because the comment says a stale declaration would
keep asking a deploy for a value nothing reads (`pikku-command-personas.ts:56-58`).

**What this rules out:** a generated personas file that declares a persona for an
environment it may not run in, and a leftover secret declaration after personas are removed.
