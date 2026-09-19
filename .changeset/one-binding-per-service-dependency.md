---
'@pikku/deploy-cloudflare': patch
---

Bind a repeated service dependency once in the generated `wrangler.toml`

A gateway collects one dependency per function it serves, so two functions
sharing a unit emitted that unit's `[[services]]` block twice — and wrangler
refuses a config that binds the same name twice, which fails the deploy
outright rather than merely repeating a line.
