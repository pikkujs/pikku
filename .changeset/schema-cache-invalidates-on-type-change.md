---
'@pikku/inspector': patch
---

Invalidate the TS-schema cache when a type it was built from changes

The on-disk schema cache was keyed on the synthesized custom-types source, the
generator options and the inspector version — but not on the types it actually
resolves. A named type (anything a function declares as its input or output)
appears in that source only as a name; its definition is read out of a project
file or a dependency's `.d.ts`. Change the shape without changing the name and
the key is identical, so pikku serves a schema for a type that no longer looks
like that, and requests are validated against it.

The stale schema also outlives `rm -rf .pikku`, because the cache lives in
`node_modules/.cache/pikku/ts-schemas.json`.

Codegen now records the files each schema set was derived from, storing their
mtime and size beside it, and regenerates when any of them moves or disappears.
The schema program is rooted at the virtual types file, so its source files are
exactly the transitive closure the schemas depend on. A cache written by an
earlier version carries no dep list and is treated as stale. The check costs
about 3ms per cache hit, and also guards the in-process cache, so `pikku dev`
picks up a type edit without a restart.
