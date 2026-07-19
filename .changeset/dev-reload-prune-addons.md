---
'@pikku/core': patch
'@pikku/cli': patch
---

Prune removed addons on `pikku dev` hot-reload. Deleting an addon wiring (`*.addon.ts`) regenerated `.pikku` on disk but left its `wireAddon` entry stranded in the live `pikkuState(null,'addons','packages')` map until a full restart (the reimport path is add-only), so `getInstalledAddons` kept reporting deleted addons. `reloadGeneratedMeta`'s sibling `reconcileAddonRegistry(declaredNamespaces)` now drops any addon namespace the fresh inspection no longer declares, and the dev watcher calls it with `inspectorState.rpc.wireAddonDeclarations`. Routes already reconcile (http meta is replaced wholesale + router reset); function-impl entries are intentionally left since the workflow service registers framework internals there that aren't in the generated set.
