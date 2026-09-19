---
'@pikku/core': patch
---

Global middleware now runs for a dispatch that belongs to an addon, not just for one in the root namespace.

`combineMiddleware` read the global list out of a single namespace — the `packageName` the dispatch carried. For anything wired by the application itself that namespace is `null`, so it worked; for a wiring contributed by an addon (an MCP tool registered through `wireAddon({ mcp: [...] })`, say) it was the addon's own package name, and the application's globals were simply not in that list. The practical effect was that an addon's tools ran with no session middleware at all: every one of them refused with "authentication required" no matter who was calling, while the identical function reached through HTTP authenticated fine.

Global middleware is application-wide by definition, and an addon's function is still running inside the host application, so the root namespace always applies. A dispatch in the root namespace resolves `[null]` as before; one in an addon resolves `[null, packageName]` — the host's globals first, then the addon's own. Globals registered by one addon still do not reach another's dispatches.
