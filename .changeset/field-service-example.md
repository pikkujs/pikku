---
'@pikku/cli': patch
---

Add the `field-service` example app and nine React hook recipes.

`online-shop` has no frontend, and `usePikkuQuery`/`usePikkuMutation` are generated per
project rather than exported from `@pikku/react` — so there was nowhere a hook example
could be typechecked. `examples/field-service` is that place: a multi-tenant dispatch
backend (scopes, a four-eyes quote approval workflow, a dispatch board channel, an agent,
three scenarios) plus an `apps/app` frontend whose components ARE the recipes. Both run in
the CI example matrix, so a hook that changes shape breaks the build instead of quietly
becoming wrong in the docs.
