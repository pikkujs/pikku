---
'@pikku/cli': patch
---

`pikku ci` builds the app before `validate`, so a clean checkout has the frontends' generated files (router tree, compiled messages) when `validate` type-checks. The default inspector is Go again: the Rust engine has no Node fallback and failed on Zod schemas built from a package import, such as the analytics scaffold's.
