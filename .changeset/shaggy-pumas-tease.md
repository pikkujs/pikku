---
'@pikku/cli': patch
'@pikku/deploy': patch
'@pikku/deploy-standalone': patch
---

Stop mangling identifiers in a bundle that a second bundler will mangle again.

Every standalone bun binary died at boot on `TypeError: t6 is not a function`. The bundle
esbuild wrote was correct; `bun build --compile`, which is the documented next step for
that runtime, renamed the parameter of the already-mangled `wireCLI` to `t6` — the name
esbuild had given the top-level `registerCLICommands` that same function calls — and the
inner reference then resolved to the parameter object.

Neither pass is wrong on its own, so the fix is to stop running both: a provider now
declares `getMangleIdentifiers()`, and the standalone adapter returns false for the bun
runtime, where `bundle.js` is an input rather than the artifact that runs. Whitespace and
syntax minification are unaffected, and every other provider still ships a fully mangled
bundle — `minify: true` could not express that, because esbuild ORs it over the granular
flags and silently ignores a `minifyIdentifiers: false` set beside it.
