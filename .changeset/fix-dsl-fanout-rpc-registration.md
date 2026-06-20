---
'@pikku/inspector': patch
---

Fix DSL `Promise.all` fanout silently failing to register its child RPC (causing a runtime "Function not found").

Two distinct causes are addressed:

- A fanout/group captured into a variable (`const results = await Promise.all(array.map(e => workflow.do(...)))`) was dropped entirely, because the `const`-declaration path had no `Promise.all` branch — fanout handling only ran on the bare/assignment path. The declaration path now extracts fanout and parallel groups too.
- `extractStringLiteral` threw on a `+` concatenation with a non-static operand (e.g. `'Enrich ' + (e.id ?? e.name)`), unlike a template literal (`` `Enrich ${e.id ?? e.name}` ``) which never threw. The throw was uncaught while scanning workflow invocations and aborted the run. The `+` branch now falls back to `${...}` placeholders to match template literals, and a step's cosmetic display name can no longer block RPC registration.
