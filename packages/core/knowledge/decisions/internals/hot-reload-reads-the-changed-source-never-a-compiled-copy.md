---
type: decision
title: Hot reload reads the changed source, never a compiled copy of it
description: A leftover .js beside a .ts made the reloader announce a reload while re-registering the previous implementation; project TypeScript is now compiled by the reloader itself
tags: core, dev
---

# Hot reload reads the changed source, never a compiled copy of it

The reloader watches `.ts` files and runs the file that changed. It used to
look for a compiled `.js` first — `<outDir>/dist/<rel>.js`, then the sibling
`<file>.js` — and import the source only when neither existed.

`pikku dev` compiles nothing. Every one of those `.js` files is a leftover from
an earlier `tsc`, `pikku dist` or bundler run, so reading one re-registered the
implementation the developer had just replaced and logged `Hot-reloaded: <fn>`
over the top of it. The log line reads as confirmation, so the change looks
applied and wrong rather than unapplied — which is the expensive way round
(#1721).

The lookup was a leftover of the first implementation, which imported raw file
content through a `data:` URL and genuinely could not handle TypeScript. The
module runner has transpiled with esbuild since, so the source was loadable all
along and the compiled candidates could only ever supply stale code.

Loading the source means the reloader also owns resolution. `require('./x.js')`
where only `x.ts` exists is what every relative import in a TypeScript project
looks like, and node's `require` has no `.js → .ts` rewrite. Resolution goes
through the host first — so packages bind to the instance the rest of the
process holds and `wire*` side effects mutate live state — and a resolved
TypeScript file outside `node_modules` is then compiled by the reloader rather
than handed back, because both node and Bun cache what they load and a helper
edited alongside its caller would otherwise keep answering with the copy loaded
at startup. That cache is scoped to a single reload for the same reason.

**What this rules out:** reintroducing a compiled-output lookup as a
"performance" shortcut, and letting the host load project `.ts` dependencies so
reloads inherit its module cache.
