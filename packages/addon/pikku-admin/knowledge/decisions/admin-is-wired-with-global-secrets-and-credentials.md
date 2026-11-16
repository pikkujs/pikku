---
type: decision
title: The admin addon is wired with globalSecrets and globalCredentials, because it declares no secrets itself
description: Core scopes an addon's SecretService and CredentialService to what it declares; admin declares none and names secrets at runtime, so its wireAddon sets both exemptions with a reason
tags: admin, secrets, credentials, wireAddon, scoping
---

# The admin addon is wired with globalSecrets and globalCredentials

`addon-runner.ts` wraps an addon's secrets in `ScopedSecretService` (and its credentials in
`ScopedCredentialService`) unless the addon's `wireAddon` sets `globalSecrets` /
`globalCredentials`. `@pikku/addon-admin` declares no secrets or credentials: its functions
(`secretHas`, `secretGet`, `secretSet`, the variable functions, the credential functions)
act on names an operator supplies at run time. Scoped, every one of them is refused with
`Access denied to secret key: <NAME>`.

The `wireAddon` the CLI generates (`serialize-admin-functions.ts`) therefore sets both, each
with a reason, and the deploy manifest reports them as `unscopedSecretAddons` and
`unscopedCredentialAddons`. It sets no `secretGrants` and no `'*'`. A hand-wired admin addon
(the CI verifier template, an app's own `wireAddon`) must carry the same two fields.
