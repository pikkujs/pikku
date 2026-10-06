---
'@pikku/deploy': patch
'@pikku/cli': patch
---

Runtime tiers now come only from the cloudsupport data (github.com/pikkujs/cloudsupport), matched by package name and installed version. A `"pikku": { "runtime" }` block in `package.json` is no longer read, and the built-in packages no longer carry one. A package the data does not list is taken to be `serverless`: the unit verifier fails the build with `RUNTIME_TIER_VIOLATION` if its bundle reaches something serverless cannot run, and the fix is to add the package to cloudsupport. A unit's own tier is its `runtime`, else the provider's default; the project's `package.json` no longer sets it. The data ships as a vendored snapshot, refreshed with `scripts/sync-cloudsupport.mjs`.
