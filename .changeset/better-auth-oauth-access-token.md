---
'@pikku/better-auth': patch
---

`betterAuthOAuthAccessToken` resolves the session from an OAuth access token on `Authorization: Bearer`, verified locally against the authorization server's JWKS. An MCP client that signed in through better-auth's `oauthProvider` can now call the app's `/mcp` and RPCs as that user.
