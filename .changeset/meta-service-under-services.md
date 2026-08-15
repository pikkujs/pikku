---
'@pikku/cli': patch
'@pikku/addon-console': patch
---

Generate the meta service under `services/` and reach it through `#pikku`

`pikku-meta-service.gen.ts` was written loose at the root of the output dir
while every wiring type sat in its own subdir, and both call sites that consume
it reached past the `#pikku` imports map to a relative path into the generated
tree — `e2e/src/services.ts` with a static import, the `functions` template with
a dynamic `await import('../.pikku/pikku-meta-service.gen.js')`. It now lands at
`services/pikku-meta-service.gen.ts` and is imported as
`#pikku/services/pikku-meta-service.gen.js`, matching the `<dir>/pikku-<x>.gen.js`
shape the rest of the generated tree already uses. Bootstrap prunes the old root
file, since a project generated before the move would otherwise keep compiling
it. The console addon's "metaService is required" error names the new path.

The `functions` template had no `imports` map at all, so its generated-code
imports were all relative; it now declares `"#pikku/*": "./.pikku/*"` and its
`services.ts` goes through it.
