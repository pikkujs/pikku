---
'@pikku/cli': patch
---

perf(deploy): minify every deploy bundle (~50% smaller workers)

The per-unit deploy bundler ran esbuild with `minify: false` — the unminified
output shipped straight to the runtime (CF Workers / server container), even
though tsc/esbuild, not the runtime, does the bundling. Enabling `minify: true`
halves every unit's `bundle.js` (e.g. a DB-backed HTTP unit 1205KB → 722KB,
auth-handler 2167KB → 1067KB), which directly cuts the serial CF upload time on
deploy. `keepNames: true` preserves `Function.name` / `constructor.name` so any
name-based reflection keeps working. Verified against the cloudflare deploy
verifier: 21/21 checks pass, total unit bytes 50.3MB → 29.0MB.
