---
type: decision
title: Standalone assets are embedded in the bun binary
description: A generated manifest of `with { type: 'file' }` imports puts the frontend inside the compiled binary; the imports must be static literals, which fixes the build order
tags: [frontend, standalone, bun, assets]
---

# Standalone assets are embedded in the bun binary

On the bun runtime the frontend ships **inside** the compiled binary rather than
beside it. `bun build --compile` embeds any module imported with
`with { type: 'file' }`, and `Bun.file()` reads the embedded path back at
runtime. That is what makes the artifact a single file you can hand someone,
which was the whole premise of the feature.

This was verified rather than assumed: a test binary was compiled, its `assets/`
directory and entry source deleted from disk, and the binary then served both
`/` and a hashed asset correctly, with `Bun.embeddedFiles` reporting both files.
Two things fell out of that check. Content types are inferred by `Bun.file` for
free, so the bun path needs no MIME table of its own. And the binary is large —
around 64MB for a trivial app — because the bun runtime is in there; that is the
cost of the single-file property, not a bug to optimize away.

The constraint that shapes the code is that **`with { type: 'file' }` cannot be
dynamic**. There is no way to embed a directory, or to build the import list at
runtime; each file needs its own literal `import` statement. So a generated
manifest module enumerates them, and generating it requires the built frontend
to already exist — see
[deploy consumes a built frontend](deploy-consumes-a-built-frontend.md).

Because assets live in the binary on one runtime and on disk on another,
`StaticMount` carries an optional `assets: Record<string, string>` map. A mount
with `assets` resolves keys through it; a mount without one resolves them against
`directory`. One mount type, one pipeline, and the node path stays exactly as it
was.

**What this rules out:** shipping the frontend as a sibling directory next to the
binary, a runtime-assembled embed list, and a second static-serving code path for
embedded assets.
