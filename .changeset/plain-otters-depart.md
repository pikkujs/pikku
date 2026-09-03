---
'@pikku/addon-console': patch
---

Ship the administration split that landed in the source but never in a release.

`@pikku/addon-console` stopped declaring the user directory, roles and scopes,
credentials and the audit trail when those moved to `@pikku/addon-admin`. No
changeset went with that commit, so every published version since — 0.12.49
included — still carries the eighteen `console:scope*`, `console:credential*`,
`console:getAudits` and `console:getAuditFilters` functions. An app that installs
both addons therefore exposes each of those capabilities twice, under two
different scope trees: `pikku:console:*` from the stale copy and `admin:*` from
the addon that replaced it.

This release removes them. `console:getMyAccess` stays: the console reads it to
decide what to render, so it belongs to the console rather than to
administration. Anything calling the removed names moves to the `admin:*`
spelling from `@pikku/addon-admin`, which has shipped them since 0.12.2.

The package's `build` script now clears `dist` before compiling. Without that the
removal would not have reached the registry: `tsc` overwrites outputs but never
deletes ones whose sources are gone, and `files: ["dist"]` publishes whatever is
left there. A build in a tree that had already compiled the pre-split source kept
all eleven `scope-*.function.js` files, so this release would have shipped the
duplicates it says it removes.
