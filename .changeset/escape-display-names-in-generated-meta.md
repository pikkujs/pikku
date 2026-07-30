---
'@pikku/cli': patch
---

Escaped display names and descriptions in generated and scaffolded sources.

A `displayName` is the human-facing label a developer writes — "Stripe's live key" — and it was interpolated raw into a single-quoted string in `pikku-secrets.gen.ts`, `pikku-variables.gen.ts`, and `pikku-credentials.gen.ts`. An apostrophe terminated the literal and the whole generated file stopped parsing, with `tsc` reporting a cascade of syntax errors in generated code rather than anything about the name. The three serializers now emit the value through `JSON.stringify`, which also covers a quote or a backslash — the same treatment the workflow map keys already get.

`pikku new-addon` had the same hole: `--display-name "Bob's CRM"` scaffolded an addon that did not compile before its author had written a line of it. Its prose now goes through the same escaping, composed with the words around it so a message stays one literal, and through a template-literal-aware escape where the scaffolded code interpolates a response status.
