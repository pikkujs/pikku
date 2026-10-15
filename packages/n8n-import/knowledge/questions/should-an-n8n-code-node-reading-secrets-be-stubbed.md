---
type: question
title: Should an n8n Code node that reads $secrets be stubbed rather than translated?
description: The Code node translator sends any script that reads $secrets to a stub, and no note or test says why this token is refused
tags: [n8n, code-node, secrets]
---

# Should an n8n Code node that reads $secrets be stubbed rather than translated?

The `BAIL` table in `packages/n8n-import/src/code-translate.ts` (lines 42-59) lists tokens that make a Code
node non-self-contained. Its comment (lines 38-41) says these reference "other nodes, the environment, or
perform side effects, none of which a purely local translation can honour".

Line 50 is `[/\$secrets\b/, 'reads $secrets']`. A match makes the translator return that reason (line 90),
and the node becomes a stub.

`$vars` (line 49) is in the same table with the same kind of reason. The comment does not single out
`$secrets`, and `code-translate.test.ts` has tests for `require()` (line 50), `$(expr)` (line 73) and HTML
comments (line 138) but none for `$secrets`.

Question: should a Code node that reads `$secrets` stay a stub, as the table does, or should the secret read be
mapped to the secret-by-name mechanism the HTTP auth descriptors use? The code does not say which is intended.
