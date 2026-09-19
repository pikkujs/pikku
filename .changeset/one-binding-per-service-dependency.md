---
'@pikku/deploy-cloudflare': patch
---

Bind a repeated service dependency once in the generated `wrangler.toml`, and
refuse two dependencies that would bind as one

A gateway collects one dependency per function it serves, so two functions
sharing a unit emitted that unit's `[[services]]` block twice — and wrangler
refuses a config that binds the same name twice, which fails the deploy
outright rather than merely repeating a line.

Two genuinely different units can also collapse onto a single binding name,
because the emitted name flattens `-`, `_` and camel humps alike: `svc-base`,
`svc_base` and `svcBase` all become `SVC_BASE`. Emitting the winner and
dropping the loser would leave the loser's callers bound to the winner's
worker — a deploy that succeeds and then answers from the wrong service. That
now fails the generation with both names, which is a naming problem the author
can see and fix.
