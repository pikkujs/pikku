---
'create-pikku': patch
---

Scaffold every template onto the `#pikku` alias

Templates are the one tree copied verbatim into a user's project, so whatever
they import is what every new Pikku app starts life importing. They reached
generated output through relative paths — `../../functions/.pikku/…` in a
runtime template, `../../.pikku/…` inside the functions template — which taught
the wrong habit and broke as soon as `create-pikku` relocated the directory,
as it does for StackBlitz.

Those specifiers now go through `#pikku/…`, resolved by tsconfig `paths`. A
runtime template points at the functions template next door, and `paths` is the
only mechanism that reaches it: Node rejects an internal-imports target that is
not `./`-relative or a bare package specifier, so a `../` target throws
`ERR_INVALID_PACKAGE_TARGET` rather than resolving. Only `functions` and
`function-addon`, which own the `.pikku` they point at, carry an `imports` map.

`templates/bun` keeps its relative path. Bun treats a `#`-prefixed specifier as
a Node subpath import and does not apply `paths` to it, so neither half of the
alias reaches next door; it needs a workspace dependency on the functions
template to make a bare specifier a legal target, which is a separate change.

Two guards in `template-alias-surface.test.ts` hold the shape: no template
reaches generated output through a relative path, and no template declares an
`imports` target Node will reject.
