---
type: decision
title: Node-only builtins are imported dynamically
description: V8CoverageService imports node:inspector inside start() so the module stays loadable on runtimes that have no such builtin
tags: services
---

# Node-only builtins are imported dynamically

`V8CoverageService` (`packages/core/src/services/v8-coverage-service.ts`) reaches
`node:inspector` through `await import('node:inspector')` inside `doStart()`,
not through a top-level import.

`@pikku/core` is loaded whole on runtimes that have no Node builtins —
Cloudflare Workers most notably. A static `import 'node:inspector'` is resolved
when the module graph loads, so it would fail the entire bundle at startup on
those runtimes, for a service that would never have been started there anyway.
Deferring the import moves the failure to the point of use, where it is both
correct and avoidable.

**What this rules out:** hoisting the import to the top of the file because the
dynamic form "looks unnecessary", and the same move in any other core module that
touches a Node-only builtin. The rule is general: if core can be loaded on
Workers, a Node builtin is imported at the call site.
