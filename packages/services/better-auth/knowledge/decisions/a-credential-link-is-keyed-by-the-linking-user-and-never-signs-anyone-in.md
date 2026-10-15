---
type: decision
title: A credential link is keyed by the linking user and never signs anyone in
description: Connecting an OAuth credential stores its account row under the linking user's id rather than the provider's identity, and the callback refuses any flow that is not a link
tags: better-auth, oauth, credentials
---

# A credential link is keyed by the linking user and never signs anyone in

`pikkuCredentialOAuth` (`credential-oauth.plugin.ts`) replaces better-auth's
`genericOAuth` link and callback. The comment explains why. `genericOAuth` models an
identity provider. It needs userinfo, keys the account on the provider's user id,
and refuses unless the emails match. A credential is not an identity. Most
credential providers expose only `/authorize` and `/token`.

So the rules are:

- **The account key is the linking user's id.** `accountId` is the user id, which
  makes `(providerId, userId)` unique by construction. No userinfo is called and no
  email is compared.
- **A link cannot sign anyone in.** The callback needs link state carried in the
  signed OAuth state. Without it, the flow ends with `session_required`. The comment
  says "only the link flow is valid here: a credential cannot sign anyone in."
- **Re-linking updates the row.** The callback looks for an existing account for
  `(providerId, userId)` and updates it. A second row would shadow the new token,
  because `getAccessToken` takes the first match.
- **Tokens are encrypted on write** with `setTokenUtil`, because reads decrypt them.

**What this rules out:** keying a credential by a provider identity, using a
connected credential to log someone in, and two live rows for one credential.
