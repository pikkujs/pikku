---
type: decision
title: An n8n HTTP tool resolves its auth from a secret at runtime, and OAuth2 or custom auth stays a stub
description: An agent-tool HTTP request reuses the main HTTP Request auth recipes, so its credential is a secret name resolved when the tool runs
tags: [n8n, http, agent-tools, auth]
---

# An n8n HTTP tool resolves its auth from a secret at runtime, and OAuth2 or custom auth stays a stub

The header comment of `packages/n8n-import/src/http-tool.ts` (lines 1-10) says the tool is a real Pikku function
for a static request. Its auth "reuses the same `httpAuthRecipe` recipe table as the main `httpRequest` node, so
OAuth2 / custom auth also stay stubs" (lines 8-9).

The `auth` field of `HttpToolSpec` is commented "Auth resolved from a secret at runtime; absent for a no-auth
tool" (lines 32-33).

The recipe table behind it gives no recipe for `httpcustomauth` (line 49) or `oauth2api` (line 50). Both
`oauth2api` and `oauth1api` return `undefined` from `predefinedRecipe` (line 115), and `httpAuthRecipe` returns
`undefined` for those (its doc comment at lines 131-134 lists OAuth2 and custom auth).

**What this rules out:** an agent-tool HTTP call that carries OAuth2 or custom auth. Such a tool stays a stub.
