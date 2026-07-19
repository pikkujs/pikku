---
'@pikku/addon-console': patch
'@pikku/console': patch
---

The addon Setup tab is now instance-aware. A new `getAddonInstances` RPC returns every wired instance of a package with its per-instance overrides, and when a package is installed more than once the Setup tab shows an instance selector. The selected instance's `credentialOverrides`/`secretOverrides` are resolved so the OAuth connect and secret status/set actions target that instance's actual project names (and the resolved names are shown), instead of always acting on the package's shared logical names.
