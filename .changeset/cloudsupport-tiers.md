---
'@pikku/deploy': patch
---

Runtime tiers now come from the cloudsupport data (github.com/pikkujs/cloudsupport), matched by package name and installed version, and no longer from a `"pikku": { "runtime" }` block in each built-in package's `package.json`. A `package.json` block is still honoured for a package the data does not cover. The data ships as a vendored snapshot, refreshed with `scripts/sync-cloudsupport.mjs`.
