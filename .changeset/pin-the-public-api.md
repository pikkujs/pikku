---
'@pikku/core': patch
---

Pin the public API, and declare which modules have import-time side effects

Nothing caught a change to what `@pikku/core` publishes. An export could appear, vanish, or have a member's signature change, and the only signal was a downstream break after release.

`public-surface.json` now pins every runtime export reachable through a `package.json` `exports` subpath, and `api-report.md` pins the API at **member** level — a method added to an interface is the change that breaks a consumer's build, and an export list cannot see it. Both regenerate from the code and are asserted against it, so widening the API is a visible diff rather than a side effect of an `export *`.

The report is written to state what the API *is* rather than merely list identifiers, so the diff is readable by a reviewer.

`sideEffects` is declared as an allowlist rather than `false`: core genuinely has some. The error registry is built by `addError` calls that run on import, so claiming `sideEffects: false` would let a bundler drop it and leave `getErrorResponse` unable to find any error. A test detects the modules that actually have side effects and fails if the allowlist disagrees.
