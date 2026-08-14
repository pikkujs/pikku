---
'@pikku/cli': patch
---

Fail validate when a workspace subpath import cannot resolve through the owning package's exports.

`exports` does not probe file extensions the way a bundler alias does, so a map
like `"./pikku/*": "./src/pikku/*"` resolves `pkg/pikku/client.gen` to a file
that was never written — the real one is `client.gen.ts`. Nothing surfaces it
while the consumer carries a `resolve.alias` for the same specifier: the alias
wins wherever that config is loaded, and the broken map only bites somewhere
else — another app in the repo, a different bundler, plain node, or a generated
vite config that never merged the app's own.

The new check pairs every workspace-internal subpath import with the owning
package's `exports` and reports the ones that resolve to nothing, matching
Node's pattern precedence (longest literal prefix, then longest suffix) and
following fallback arrays so a declaration-only subpath still counts as
resolvable. It runs once at the workspace root, where both halves are in view,
and reports each broken subpath once rather than once per importer.
