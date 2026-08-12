---
'@pikku/addon-console': patch
'@pikku/addon-graph': patch
---

Resolve every entry point under `dist`

`imports["#pikku"]` named `./.pikku/pikku-types.gen.ts` — a TypeScript file, at
runtime, inside `node_modules` — while `files` publishes only `dist`. The
generated output under `dist/.pikku` also imports a `types/application-types.d.js`
that nothing was copying there, since a hand-written `.d.ts` is an input to
`tsc` rather than something it emits.

Both now point at the built copy. The addon's own build resolves `#pikku`
through tsconfig `paths`, so no entry point has to reach into the source tree.
