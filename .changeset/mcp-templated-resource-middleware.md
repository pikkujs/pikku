---
'@pikku/core': patch
---

Run a templated MCP resource's middleware for concrete request URIs.

`runMCPResource` resolves a templated resource's `pikkuFuncId` via the template
key, but `runMCPPikkuFunc` then re-looked-up the resource meta by the concrete
request URI (`resource://users/123`), which no meta is stored under — so meta was
`undefined` and the resource's merged middleware, including any tag-derived auth
gate, was silently dropped. A templated MCP resource was reachable with its gate
skipped.

The meta key — the template for a templated match, the URI otherwise — is now
carried through to the meta lookup, so the declared middleware runs.

CWE-863 / CWE-306.
