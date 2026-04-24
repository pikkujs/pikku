---
'@pikku/inspector': patch
---

fix(inspector): exclude node_modules sources from the project source-file filter

When a project uses a yarn-workspace addon, `node_modules/@pkg/addon` symlinks
back into a sibling package; those symlinked source files were passing the
`startsWith(rootDir)` check and getting discovered as project sources.

This caused two bugs:

1. `Config`/`SingletonServices` etc. declared in the addon were collected
   alongside the consumer's, producing `More than one CoreSingletonServices found`
   during typesLookup.
2. Addon RPC functions landed in the consumer's `RPCMap` at root scope
   (unprefixed) and `wireAddon({ name, package })` was silently ignored — the
   generated `FlattenedRPCMap` read `// No addon packages, use RPCMap directly`
   even when the consumer's wiring registered the addon.

The filter now also excludes any `/node_modules/` paths so symlinked addon
sources aren't treated as project files.
