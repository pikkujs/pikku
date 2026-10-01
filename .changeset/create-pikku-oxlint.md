---
'create-pikku': patch
---

New apps scaffolded from the in-repo templates now include `oxlint` and `oxlint-tsgolint`, a `.oxlintrc.json` with the type-aware promise rules at `error`, and a `lint` script, so they pass `pikku validate`'s oxlint checks.
