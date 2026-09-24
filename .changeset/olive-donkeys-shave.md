---
'@pikku/cli': patch
---

fix(cli): reading the auth schema survives a plugin whose init rejects

Better Auth 1.7 made constructing an auth instance do I/O. A plugin's `init`
starts real work and does not wait for it — the OAuth provider behind
`@better-auth/mcp` seeds its `oauthResource` rows that way.

Schema introspection builds the instance against a throwaway database purely to
read `options`, so that work has nowhere to go: the auth tables do not exist
yet, and on the SQLite path the handle is closed as soon as the options have
been read. The seed then rejected with nothing awaiting it, and the default for
an unhandled rejection is to terminate the process — so `pikku db generate` and
the `pikku db migrate` drift check died on `database is not open`, from a write
the schema derivation never wanted, in any project that merely configured MCP.

The rejection is now reported and stepped over. Whatever the plugin was doing
says nothing about the shape of its tables, which is all that is being read.
