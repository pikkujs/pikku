---
'@pikku/skills': patch
---

Audit the remaining skills against the shipped APIs and correct the drift.

- pikku-mcp: there is no `wireMCPTool` — a tool *is* the function (`mcp: true` or `pikkuMCPToolFunc`), while `uri`/`title`/`name` belong on `wireMCPResource`/`wireMCPPrompt` rather than on the `pikkuMCP*Func` factories; resources return `{ uri, text }` only; `PikkuMCPServer` takes `(config, logger)`
- pikku-http: `channel` is on the wire, not services; `sse` is `get`-only and `query` is `post`-only; `docs` was never a `wireHTTP` option; factories come from `#pikku`
- pikku-security: documents `authBearer`'s static-token mode, `authCookie`'s merged defaults and re-issue rule, and that every strategy is a no-op without an HTTP request or with a session already set
- pikku-better-auth: the `admin:users:*` scope tree gained create/ban/remove/sessions/password, and `syncProjectedAdminRole` projects them onto `user.role` for better-auth's own `admin()` endpoints; documents dev quick login
