---
type: decision
title: An unconfigured OAuth provider is skipped and a malformed one throws
description: A credential whose app secret is absent is left out with a warning so one missing provider cannot break every session read, while a secret that exists but has no clientId still fails
tags: better-auth, oauth, credentials, configuration
---

# An unconfigured OAuth provider is skipped and a malformed one throws

`credentialOAuthProviders` (`credential-oauth-providers.ts`) turns each OAuth2
credential declaration into a `genericOAuth` provider. Its doc comment says the
two cases are different:

- **Unconfigured.** The secret does not exist yet, for example an installed
  addon's provider the operator has not set up. The provider is skipped with a
  warning. The comment says "a single unconfigured provider must not brick the
  whole auth instance (every getSession would then 500)." An optional secret that
  resolves to `undefined` is treated the same way.
- **Malformed.** The secret exists but has no `clientId`. That is "a genuine
  misconfiguration and still throws."

**What this rules out:** failing every session read over one provider nobody has
configured, and treating a broken secret as if it were absent.
