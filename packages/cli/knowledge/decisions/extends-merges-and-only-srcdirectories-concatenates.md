---
type: decision
title: A config that extends another merges into it, and only srcDirectories concatenates
description: `extends` deep-merges objects, appends srcDirectories, replaces every other array, treats null as removal, and resolves each layer's paths against its own file before merging
tags: [config, extends, srcDirectories]
---

# A config that extends another merges into it, and only srcDirectories concatenates

`extends` used to spread the child over the fully resolved parent, so any field
the child set replaced the parent's outright. A `pikku.cloud.json` that wanted
one extra source directory had to repeat every parent entry, and a child's
`scaffold: { workflow: true }` silently dropped the parent's other features and
its `pikkuDir`.

The rule now:

- **Objects merge key by key**, recursively (`clientFiles`, `scaffold`,
  `schema`, `frontends`, `packageMappings`, …).
- **`srcDirectories` concatenates**, parent first, de-duplicated by resolved
  path. It is the only array that does: it is a list of paths, so appending is
  unambiguous. Every other array — `ignoreFiles`, `blocks`, `filters.tags`,
  `frontends.*.dev.command`, extension lists — is a value stated in full, and
  appending would be wrong (a second `dev.command` is not a longer command; an
  extension list documents "setting this replaces the defaults"). Those the
  child replaces. To add another path list later, add it to
  `EXTENDS_CONCAT_PATH_LISTS`.
- **`null` removes** the parent's value, e.g. `clientFiles.rpcWiringsFile: null`.

## Paths belong to the file that wrote them

Each layer's paths are made absolute against that layer's own location before
merging — `outDir`, `clientFiles` and `frontends.*.cwd` against its directory;
`srcDirectories`, `tsconfig`, `scaffold` paths and top-level `*File`/`*Dir`/
`*Directory` against its `rootDir` (its directory when it sets none). `rootDir`
is inherited from the parent unless the child sets one. `srcDirectories` is
returned relative to the merged `rootDir`, because every consumer joins it onto
`rootDir`.

## Derive once, from the merged input

The parent is merged as raw input, not as a loaded config. Loading the parent
first had filled in every derived output file from the parent's `outDir`, so a
child that changed `outDir` still wrote to the parent's, and an addon parent got
`/addon` appended to `outDir` twice.
