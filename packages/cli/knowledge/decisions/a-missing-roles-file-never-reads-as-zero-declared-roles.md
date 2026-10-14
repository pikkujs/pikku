---
type: decision
title: A missing roles file never reads as zero declared roles
description: loadDeclaredRoles returns null on a missing or malformed roles meta file, so prune cannot treat a read failure as an empty declaration and wipe system roles
tags: cli, roles, safety
---

# A missing roles file never reads as zero declared roles

`loadDeclaredRoles` in `packages/cli/src/functions/commands/roles-shared.ts` returns
`null`, never an empty array, when the metadata cannot be used (`roles-shared.ts:29-34`).
The comment gives the reason: prune removes everything not in the declared set, so
"nothing is declared" and "we could not find out" must stay different
(`roles-shared.ts:31-34`).

The function returns `null` in three cases. The path is not configured
(`roles-shared.ts:40-46`), the file cannot be parsed (`roles-shared.ts:48-57`), or the
parsed value fails the shape check (`roles-shared.ts:59-65`). The callers in
`roles-prune.ts` and `roles-audit.ts` throw on `null` rather than continue.

**What this rules out:** a prune that runs against a missing file and treats every
system role as undeclared.
