---
type: decision
title: An actor credential is derived per persona
description: What a caller presents to the actor endpoint is HKDF-derived from the root secret and the address it signs in as, so one credential opens one persona
tags: services
---

# An actor credential is derived per persona

`SCENARIO_ACTOR_SECRET` is a root, not a password. What a caller presents to
`/auth/sign-in/actor` is `deriveActorSecret(root, email)`
(`packages/core/src/services/persona-actor-secret.ts`) — an HKDF-expanded
HMAC-SHA256 over the lowercased address, on the same key-material primitives
everything else in core signs with. The endpoint does not store or look anything
up: it re-derives the expected value for whichever address is being signed in as
and compares. A credential minted for one persona is refused for every other.

The root itself is not accepted as a credential, and a root shorter than 32
characters refuses the endpoint outright rather than deriving weak credentials
from it. The server-side warning names the problem; what the client is told does
not.

Derivation rather than a per-persona secrets table because there is then nothing
to store, provision, or keep in sync — the target already holds the root, and
rotating it invalidates every credential at once.

This is what lets a holder be handed less than everything:

- The browser switcher gets `VITE_DEV_ACTOR_SECRETS`, one credential per
  declared persona. The root stays on the dev server, so a bundle can no longer
  hold the thing that is entitled to every persona.
- A run can be given `PIKKU_PERSONA_SECRETS` (`id=secret,…`, minted with
  `pikku persona secret`) instead of the root, and then it can sign in as those
  personas and no others. Asking for one outside the list throws naming the
  persona rather than falling back to the root.

**What this rules out:** accepting the root as a credential at the endpoint,
putting the root in any client bundle, and comparing a presented credential
against a stored one. It also rules out per-persona secrets that are generated
randomly and written down — the derivation is the reason there is nothing to
provision.
