---
'@pikku/fetch': patch
---

`CorePikkuFetchOptions` now takes an optional `fetch`, used in place of the global one for every request the client makes, including the SSE stream.

The global is the only transport a client could use, which is a problem anywhere the useful transport is not a network call. A Cloudflare Worker rendering server-side reaches a sibling Worker through a binding, not through its own public hostname — fetching the latter leaves the isolate, re-enters the edge and fails the TLS handshake. The alternative was to swap `globalThis.fetch` around a call, which is unsound in a Worker because concurrent requests share the global. Passing the implementation per client keeps it where the caller already scopes everything else.
