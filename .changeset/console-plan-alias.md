---
'@pikku/console': patch
---

Import the plan types relatively in the knowledge components, so a consuming app can typecheck them.

`@/` resolves to the CONSUMING app's `src/`, which is what makes `@/i18n/messages` and
`@/lib/assets` the injection points they are meant to be. `@/lib/plan` had no such
counterpart: every consumer resolved it against its own `src/lib/plan`, found nothing, and
took 50-odd cascading `unknown` errors across the plan components. Every sibling in
`components/knowledge/` already imports `../../lib/knowledge`; these four now match.
