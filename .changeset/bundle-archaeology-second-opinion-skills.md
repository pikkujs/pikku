---
'@pikku/cli': patch
---

Bundle two new skills: `software-archaeology` and `product-second-opinion`.

`software-archaeology` reverse-engineers an existing repository into a Product Blueprint — a `.knowledge/` directory of schema-validated JSON plus a human-readable `blueprint.md`, recovering domains, entities, commands, queries, events, policies, workflows and invariants so an organically-grown app can be rebuilt cleanly (e.g. as a Pikku app). It is language-agnostic — the model reads the code rather than relying on per-language AST tooling — and ships `scripts/validate.mjs` (node, no deps) to enforce the output contract, plus `references/pikku-mapping.md` covering how a blueprint maps onto Pikku primitives.

`product-second-opinion` consumes that `.knowledge/` blueprint and produces a plain-language report for a non-technical owner: how the app they hold actually works, what's solid, what's holding them back (with business impact and effort), and an opinionated argument for a better design.

Both install via `pikku skills install`. Neither declares an `installGroups`, so they are excluded from `--core` and `--fabric` and install with the default (install-everything) invocation or an explicit `--only`.
