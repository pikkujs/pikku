---
type: decision
title: Built-ins are Node's, not the build runtime's
description: The CLI re-execs under Bun, whose builtinModules also lists ws, undici and bun:*; the tier check and the externals use Node's list only
tags: [deploy, bundling, bun]
---

# Built-ins are Node's, not the build runtime's

The CLI re-execs itself under Bun, and Bun's `builtinModules` also lists `ws`,
`undici`, `bun` and `bun:*`. Reading that list as it is refused `ws` in a Worker
and left it external, so a unit using `@cloudflare/puppeteer` did not build.

`NODE_BUILTIN_MODULES` removes those names. Both the tier check and
`nodeBuiltinExternals` use it, so a build gives the same bundle under either
runtime. A caller that wants one of them external names it as an extra.
