---
'@pikku/cli': patch
---

fix(deploy): say "native addon" when a serverless bundle hits one

A native addon cannot be bundled for a serverless runtime — there is no `.node`
loading on Workers — but that is not what the bundler reported. The addon's JS
wrapper imports `node:child_process`, `node:stream` and friends, none of which
resolve on a `neutral` platform, so the failure arrived as a wall of unresolved
builtins naming neither the package nor the reason:

```
Could not resolve "node:util"          @ sharp/dist/constructor.mjs
Could not resolve "node:child_process" @ sharp/dist/libvips.mjs
Could not resolve "detect-libc"        @ sharp/dist/libvips.mjs
```

Read as missing polyfills, that sends people to `nodejs_compat`, which cannot
help — the blocker is the binary underneath.

A failed serverless compile now reads the owning packages back out of those
paths, checks each for a native binary (`gypfile`, a `binary` declaration, a
node-gyp install script, per-platform optional dependencies, an `os`
restriction), and when it finds one leads with the package, the evidence, and
the two ways out: `deploy.serverlessIncompatible` in `pikku.config.json`, or
`deploy: 'server'` on the function. The original error is kept underneath. A
failure with no native addon behind it is rethrown untouched.
