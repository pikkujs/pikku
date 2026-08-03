---
'@pikku/inspector': patch
'@pikku/core': patch
---

`defineScope` and `defineSystemRole` accumulate across call sites again. Only `definePersonas` is one-per-codebase.

The previous release made all three single-declaration constructs, which no project scaffolding user-admin could satisfy: the CLI generates a `defineScope` of its own in `user-admin.gen.ts` carrying the whole `admin` tree, and `@pikku/addon-console` spells the same tree out again, so a second hand-written declaration failed the build with PKU583 — and the losing file's scopes were dropped from the metadata rather than merged.

Exempting generated files would have reinstated exactly the ambiguity the rule removes, only for the files nobody can read the rule from. The real fix is for `admin` to be a default scope nobody declares, at which point the rule can come back for scopes and roles.

`definePersonas` is unaffected: nothing generates one, so its single call site stands.
