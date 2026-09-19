---
'@pikku/cli': patch
---

Resolve a deploy provider whose exports map has no `require` condition

A provider is located with `require.resolve` against the project, so an
ESM-only package — one exporting `types` and `import` and nothing else —
failed with ERR_PACKAGE_PATH_NOT_EXPORTED and was reported as "not
installed". The bare-import fallback could not rescue it either, because
that resolves from the CLI rather than from the project.

The exports map is now read the way node reads it: conditions are walked in
the package author's declaration order, nesting included, so a provider
shipping `{ "import": { "node": "./node.js", "default": "./browser.js" } }`
loads the node build rather than the browser one.
