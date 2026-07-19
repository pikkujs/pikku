---
'@pikku/core': patch
'@pikku/console': patch
---

Scope `console:getAddonInstalledPackage` to the addon's own `.pikku` metadata.

Previously every addon returned the _app's_ secrets/wirings (read from the app's
`.pikku` root), so the installed-package view couldn't show what a given addon
actually requires. `MetaService` gains optional `readPackageFile`/`readPackageDir`
helpers (implemented by `LocalMetaService`, which resolves the addon package's
root from node_modules), and `getAddonInstalledPackage` now reads secrets,
variables, wirings, schemas, README and package.json from the addon package
itself. It also reads and returns the addon's `credentials` meta (OAuth2 + wire
credentials), which was never surfaced before — entries with an `oauth2` field
are the OAuth integrations to connect.
