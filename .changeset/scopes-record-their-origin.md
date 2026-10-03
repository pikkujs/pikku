---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/console': patch
---

Every scope tree now records where it came from: `origin` on `ScopeDefinitionMeta` is `{ kind: 'app' }` for the app's own `defineScope`, `{ kind: 'generated' }` for a tree the CLI wrote into the project (a `.gen.ts`, or the `app` root derived from personas), and `{ kind: 'addon', package, displayName }` for one an installed addon declared. An addon's build stamps its own package and display name on its trees, and the host keeps that name while recording the package it actually installed. `MetaService.getScopesMeta()` reads the result, and the console's all-meta payload carries it as `scopes`.

The console's Scopes page becomes **Permissions** and is grouped by that origin: the app's own permissions first, then what Pikku generated into the project, then one card per addon (Pikku's own before third-party, each alphabetical), each card folding to its header — the app's own starts open, every addon's starts folded, and any search or filter opens them all. Above the cards, two filters narrow the page to what one role is given (or to what no role is given yet) and to one source. A permission group no longer says "Not part of any role yet" above lines that are each given to a role.
