---
type: decision
title: A Cloudflare unit registers its addons' functions and schemas on first use, not at startup
description: Per-unit codegen for a provider with lazyAddonRegistration splits each addon's published bootstrap, imports its meta statically and its function and schema registrations from an exported loadAddons, which the Cloudflare entry awaits before building services
tags: cli, deploy, cloudflare, addons
---

# A Cloudflare unit registers its addons' functions and schemas on first use, not at startup

A Worker evaluates its whole bundle inside a startup CPU budget. An addon's
bootstrap statically imports every function module and every JSON schema it
ships, so wiring a large addon (`@pikku/addon-github`: 811 functions, 1416
schemas) failed the deploy with "Script startup exceeded CPU time limit" (#1497).

`pikku all --lazy-addons` (passed by per-unit codegen when the provider sets
`lazyAddonRegistration`, which the Cloudflare adapter does) reads each wired
addon's published `pikku-bootstrap.gen.js` and re-emits its imports in the
consumer's bootstrap: everything statically except `schemas/register.gen.js` and
`function/pikku-functions.gen.js`, which move into an exported, memoised
`loadAddons()` as dynamic imports. esbuild wraps a dynamically imported module
in a lazy initialiser, so the bundle carries the code but does not evaluate it.
The Cloudflare entry wraps `createSingletonServices` to await `loadAddons()`
first, which every request path goes through.

The split is done on the consumer side, from the addon's published file, so it
works for addons already on npm. A bootstrap holding anything other than plain
side-effect imports is imported whole, as before.

**What this rules out:** thunks in `addFunction` / `addSchema` (every reader of
the function map would have to resolve them, and core's function runner is the
one that would change), and a per-runtime choice in the core runner. Non-CF
runtimes and the server container keep the eager bootstrap.

**Still open:** the deferred code is still parsed at startup. On a synthetic
addon of the github addon's size, startup evaluation fell from ~438ms to ~191ms
(node, median of 7), and the first `loadAddons()` took ~334ms. Bundling only
the reachable addon functions (#1497's second proposal) is what removes the rest.
