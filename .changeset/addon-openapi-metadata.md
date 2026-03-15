---
"@pikku/cli": patch
---

Add OpenAPI metadata to pikku.config.json for generated addons

When an addon is scaffolded with `--openapi`, the config now includes an `openapi` object with `version` (from the spec's `info.version`) and `hash` (a contract hash of paths, methods, params, and schemas). This lets users and tooling know whether an addon was auto-generated and if the upstream API contract has changed.
