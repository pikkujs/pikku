---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Fail codegen with a clear error when the installed `@pikku/core` violates the CLI's peer range (PKU718).

Some package managers (bun, yarn) install straight past an unsatisfied `peerDependencies` range instead of failing, so `@pikku/cli` could end up next to a `@pikku/core` outside the range it declares — and the only symptom was a cryptic missing-export crash deep in codegen or at runtime (e.g. `The requested module '@pikku/core/dev' does not provide an export named 'reloadGeneratedMeta'`).

The existing preflight that catches a *split* core (two installed versions, `PKU717`) now also validates the *single* installed core's version against the CLI's own `@pikku/core` peer range, and fails with the exact versions and the fix (`@pikku/cli` and `@pikku/core` move together — bump both to the same release, update any overrides/resolutions pins, reinstall). Set `PIKKU_ALLOW_CORE_SKEW=1` to downgrade the failure to a warning if you have verified the installed pair is compatible, mirroring `PIKKU_ALLOW_DUPLICATE_CORE`.
