---
'@pikku/core': patch
'@pikku/express': patch
---

Remove the `@pikku/core/internal` entry point. It aliased the same file as
`@pikku/core/ecosystem`, so the two published an identical set of names under
two specifiers. Import from `@pikku/core/ecosystem`.
