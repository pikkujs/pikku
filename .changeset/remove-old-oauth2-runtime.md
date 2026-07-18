---
'@pikku/addon-console': patch
'@pikku/console': patch
'@pikku/core': patch
---

Remove the old, pre-better-auth OAuth2 credential runtime now that the
`credentialOAuth` plugin owns credential linking, storage and refresh.

- `@pikku/core`: drop the unused `createOAuth2Handler` HTTP-routes flow (and its
  `CreateOAuth2HandlerOptions`) from the `./oauth2` entrypoint. The credential
  schema types (`OAuth2AppCredential`, `OAuth2Token`) and the `OAuth2Client`
  API helper remain exported.
- `@pikku/addon-console`: delete the six `oauth-*` console functions
  (connect/disconnect/status/exchange-tokens/refresh-token/test-token) and the
  `OAuthService` behind them — credential connections now flow through
  better-auth's `/credential-oauth/link` + `/callback`.
- `@pikku/console`: the credential UI no longer calls the removed
  `console:oauth*` RPCs. Per-user and singleton (platform) OAuth2 credentials
  connect via the `/credential-oauth/link` full-page redirect and disconnect via
  `console:credentialDelete`; the `/oauth/callback` popup page is removed.
