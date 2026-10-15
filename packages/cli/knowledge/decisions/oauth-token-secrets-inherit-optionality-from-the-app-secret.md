---
type: decision
title: OAuth token secrets inherit optionality from their app secret
description: In the generated secrets types, an OAuth2 token secret is optional exactly when its app credential secret is optional, so a deployment that may omit the app is never asked for tokens
tags: cli, secrets, oauth, codegen
---

# OAuth token secrets inherit optionality from their app secret

`serializeSecretsTypes` in `packages/cli/src/functions/wirings/secrets/serialize-secrets-types.ts`
handles OAuth2 secrets separately from plain ones (`serialize-secrets-types.ts:34-51`). The token
secret's optional marker is taken from the app secret's `meta.optional` (`serialize-secrets-types.ts:39`).

Both the app key and the token key in the `CredentialsMap` get `?` when the app is optional
(`serialize-secrets-types.ts:41-43`). The metadata entries for both get `optional: true` under the same
condition (`serialize-secrets-types.ts:46-51`).

The comment gives the reason. Nobody can connect without the client id and secret, so a deployment
allowed to omit the app is never asked for the tokens either (`serialize-secrets-types.ts:36-38`).

**What this rules out:** a required token secret next to an optional app secret, which would make an
optional OAuth integration block a deploy.
