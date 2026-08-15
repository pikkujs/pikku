---
type: decision
title: Hot reload owns its module registry instead of re-importing
description: Dev reload transpiles to CJS and runs modules through vm.compileFunction, because the native ESM loader map cannot be evicted
tags: core
---

# Hot reload owns its module registry instead of re-importing

`packages/core/src/dev/module-runner.ts` re-runs a changed user file by
transpiling it to CJS with esbuild, executing it via `vm.compileFunction`, and
storing the resulting exports under a **stable absolute-path key**. A reload
overwrites that one registry slot, so the previous module becomes unreachable and
is collected. `packages/core/src/dev/hot-reload.ts` drives it from the file
watcher.

The obvious alternative — re-`import()`ing the file under a fresh URL (a `data:`
URL on Node, a uniquely-named temp sibling on Bun) — is unbounded. The native ESM
loader keeps a `Map<url, moduleRecord>` for the life of the realm with no
eviction API, so every reload permanently leaks a module record; measured at
roughly 0.3–1.3 MB per edit, which is ~84 MB on Node and ~222 MB on Bun over 200
edits, and eventually OOMs a long editing session. `dev/module-runner.test.ts`
asserts both the single-slot guarantee and bounded heap growth.

Two details keep the mechanism honest. `import`s inside the user file are
delegated to `createRequire`, whose resolution matches the native loader _and_
returns the same live singletons (Node and Bun share the require/import cache) —
that is what lets a reloaded file's top-level `wireHTTP` side effects mutate the
services the running server is already using. And esbuild is invoked with no
sourcemap: an inline sourcemap embeds a base64 copy of the source that the engine
retains per compile, reintroducing exactly the linear growth this runner exists
to remove. The known limitation is that a file using top-level `await` cannot be
emitted as CJS; `run` returns `null` and the caller keeps the previously loaded
code.

**What this rules out:** "simplifying" the reloader back to `await
import(url + '?t=' + Date.now())` or any fresh-URL variant, and turning
sourcemaps back on for nicer stack traces (`filename` already anchors traces to
the user file). It also rules out swapping `createRequire` for a fresh `import()`
inside the compiled module — resolution would produce a _distinct_ copy of every
dependency, and the reloaded file would then wire itself into services nobody is
serving from.
