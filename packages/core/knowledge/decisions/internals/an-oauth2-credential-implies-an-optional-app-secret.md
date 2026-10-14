---
type: decision
title: An OAuth2 credential implies its app client secret, optional and overridable by declaration
description: deriveOAuth2AppSecrets creates the app client id and secret for each OAuth2 credential, marked optional, unless the project already declares that secret id
tags: core, secrets, credentials, oauth2
---

# An OAuth2 credential implies its app client secret, optional and overridable by declaration

`packages/core/src/wirings/secret/derive-oauth2-app-secrets.ts` adds the app's
client id and secret for each OAuth2 credential a project declares. The doc comment
says the pair has the same shape every time, so writing it by hand "bought nothing"
and was often skipped (`derive-oauth2-app-secrets.ts:7-12`).

- A secret id that is already declared is skipped, so an explicit declaration
  wins and keeps its own description or `docsUrl` (`derive-oauth2-app-secrets.ts:25`,
  `31`, and the comment at `derive-oauth2-app-secrets.ts:14-15`).
- The derived secret has `optional: true` (`derive-oauth2-app-secrets.ts:38-39`).
  The comment says an addon that also authenticates by API key "must still deploy
  without an OAuth app configured" (`derive-oauth2-app-secrets.ts:17-19`).
- The OAuth2 settings (token secret, URLs, scopes, PKCE, extra params) are copied
  from the credential (`derive-oauth2-app-secrets.ts:41-49`).

**What this rules out:** requiring a deployment to configure an OAuth app for a
credential that is not used, and a derived secret overriding one the author
declared.
