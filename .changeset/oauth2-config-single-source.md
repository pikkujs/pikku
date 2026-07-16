---
'@pikku/cli': patch
'@pikku/openapi-parser': patch
---

Make `wireCredential` the single source of truth for an addon's OAuth2 config.

Generated addon services declared their own `<NAME>_OAUTH2_CONFIG` const and passed
it to `OAuth2Client`, so an addon's OAuth2 config existed twice and the two drifted:
`pikku new addon --oauth` emitted a service reading `<NAME>_TOKENS` alongside a
credential declaring `<NAME>_OAUTH_TOKENS`, and the OpenAPI importer fell back to
`https://example.com/oauth2/token` while emitting no `wireCredential` at all. The
console builds its authorize URL from `wireCredential`, so connecting succeeded and
the service then looked for the token under a name nothing had written.

- `pikku-credentials.gen.ts` now exports `CREDENTIAL_OAUTH2_CONFIGS` with each
  credential's full declared config. It previously reduced `oauth2` to a boolean, so
  there was nothing for a service to import — which is why the const existed.
- Generated services import their config from it instead of redeclaring it.
- The OpenAPI importer emits a `wireCredential` using the spec's real
  `authorizationUrl` / `tokenUrl` / `scopes`, and marks placeholder URLs with a TODO
  when the spec declares no oauth2 flow.

Existing addons pick this up on regeneration.
