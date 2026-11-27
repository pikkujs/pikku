---
'@pikku/cli': patch
---

`pikku bootstrap` at the root of a project with a main package or workspace addons now bootstraps each of them, as `pikku all` does. Before, a clean checkout had no `#pikku` files in the main package, so `pikku db migrate` applied the migrations and then failed with `Cannot find package '#pikku'`.
