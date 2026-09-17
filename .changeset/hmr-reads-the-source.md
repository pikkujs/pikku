---
'@pikku/core': patch
---

fix: hot reload reads the changed source instead of a leftover compiled copy

`pikku dev` announced `Hot-reloaded: <fn>` and kept serving the previous
implementation whenever a `.js` from an earlier `tsc`, `pikku dist` or bundler
run sat beside the edited `.ts` — the reloader preferred that file, and dev
never rebuilds it. The changed source is now what runs, and the module runner
resolves and compiles the project's own TypeScript dependencies so a helper
edited alongside its caller reloads with it.
