---
"@pikku/cli": patch
---

Fix the CLI cold bootstrap path so fresh `pikku bootstrap` and `pikku all` runs generate the internal RPC metadata and required type files in the right order, and declare the `@pikku/fetch` dependency required by the generated Fabric SDK.
