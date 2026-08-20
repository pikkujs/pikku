---
'@pikku/cli': patch
---

Narrow the Bun resolve plugin's `onResolve` filter to the specifiers it actually
rewrites. A catch-all filter that deferred to Bun for everything else made Bun
bundle any bare specifier resolved through a package.json `exports` subpath
(`@pikku/core/workflow`) as an empty module, so every deployed worker died at
startup with `ReferenceError: PikkuWorkflowService is not defined`.
