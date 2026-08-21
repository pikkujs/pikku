---
'@pikku/core': patch
---

fix(dev): keep `import.meta` pointing at the real file in the hot-reload runner

The dev module runner transforms each user file to `cjs` before compiling it,
and esbuild's `cjs` output rewrites `import.meta` to an empty object. Any module
that resolves its own neighbours through `createRequire(import.meta.url)` —
sharp, onnxruntime-node, essentially every package with a native binding —
therefore received `undefined` and failed with `Cannot find module
'@img/sharp-linux-x64/sharp.node' from ''`. sharp's own loader filters on
`MODULE_NOT_FOUND` and reports its generic "could not load the sharp module"
instead, so the empty referrer never appears in the error the developer sees.

`import.meta.url`, `import.meta.filename` and `import.meta.dirname` are now
defined to the file being run, so resolution behaves as it does under Node's
ESM loader.
