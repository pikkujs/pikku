---
type: decision
title: The terminal secret prompt echoes the typed value
description: promptSecret on a terminal uses readline with output to stdout and no echo suppression, so a typed secret is visible on screen
tags: cli, cloud, prompt, secrets
---

# The terminal secret prompt echoes the typed value

`promptSecret` in `packages/cli/src/cloud/lib/prompt.ts` reads a value that should not reach shell history. With no
terminal on stdin it reads the first line piped in (`prompt.ts:43-51`). With a terminal it creates a readline interface
with `terminal: true` and `output: stdout` (`prompt.ts:54`).

The comment directly above the question says the masking is best effort, that readline does not suppress echo, and that
the standard prompt is used because it matches what wrangler does (`prompt.ts:55-57`). The code does not replace the output
stream to hide input, so the typed characters are shown.

**What this rules out:** describing the terminal prompt as masked input. Piped input avoids the echo entirely.
