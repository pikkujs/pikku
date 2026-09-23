---
'@pikku/skills': patch
---

New `pikku-report` skill for `pikku fabric report`.

A finding is about pikku rather than about the app, and the corpus had no skill
for filing one: the material lived inside `pikku-build/references/feature.md`
and was reachable only in the "feature added to an existing app" mode. The new
skill owns the workaround-first ladder, the product-vs-harness kinds, the
strict validation rules (a resolved finding needs a workaround or a proposal; an
unresolved one needs `--tried`), the JSON-on-stdin form, and the local spool
(`pikku fabric findings list|flush|clear`). `pikku-build`'s reference now points
at it instead of carrying a copy. `installGroups: [core]`.
