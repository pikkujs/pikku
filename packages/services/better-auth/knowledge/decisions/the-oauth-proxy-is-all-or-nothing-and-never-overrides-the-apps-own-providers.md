---
type: decision
title: The OAuth proxy is all or nothing and never overrides the app's own providers
description: A stage that carries part of the OAuth proxy configuration fails at boot, and a provider the app configures itself cannot also be routed through the proxy
tags: better-auth, oauth, proxy, configuration
---

# The OAuth proxy is all or nothing and never overrides the app's own providers

`oauth-proxy.ts` turns sign-in through a host's OAuth proxy on or off for a stage.
Its configuration is four values: `OAUTH_PROXY_SECRET` (a secret),
`OAUTH_PROXY_URL`, `OAUTH_PROXY_PROVIDERS` and an optional `OAUTH_PROXY_KEY_ID`.

- **Off when nothing is set.** If neither the URL nor the provider list is present,
  the proxy is off. The provider list `none` also turns it off.
- **Partly set is a boot failure.** The doc comment says a sign-in button that
  silently does nothing is worse than a boot failure that names what is missing.
  The error lists the missing values.
- **The secret is not a signal.** The comment says schema tooling answers every
  secret read with a made-up value, so a secret alone must not count as a
  half-configured proxy.
- **Known providers only.** Each listed id must be in `PROVIDER_REGISTRY`, and its
  secret must hold a `clientId`. Otherwise it throws.
- **No override.** If the app also lists one of those providers in its own
  `socialProviders`, `applyOAuthProxy` throws. The comment says the proxy plugin
  redirects every callback to the proxy, and that would try to exchange a code
  issued to the app's own credentials.

The proxy client secret is a fixed placeholder. The real one stays on the proxy.
When a key id is set, sign-in and link-social `state` values are prefixed with it.

**What this rules out:** a stage that half-enables the proxy and says nothing, and
the same provider running on the app's credentials and the proxy's at once.
