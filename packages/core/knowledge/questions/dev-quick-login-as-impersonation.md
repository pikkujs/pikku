---
type: question
title: Can dev quick login become impersonation?
description: Dev quick login signs in a fixed admin account; making it an impersonation step needs an existing admin session it does not have, so it would need a new bypass
tags: auth, services
---

# Can dev quick login become impersonation?

Today `/dev/quick-login` (`packages/services/better-auth/src/dev-quick-login.ts`)
provisions a fixed `admin@pikku.dev` account with a fixed password and grants it
the admin and console roots. It is refused outside loopback, behind a proxy, and
in production.

The proposal is that quick login should just be impersonation. Impersonation
(`resolveImpersonatedSession`) only applies on top of an existing session, and
the caller must hold `admin:impersonate`. Quick login has no session before it
runs, so making it impersonation needs one of:
- an unauthenticated dev-only route that accepts a user id, which is a new
  bypass of the check that impersonation exists to keep, or
- quick login keeps minting the dev admin session, and personas are impersonated
  from there.

The second keeps one mechanism for personas. Undecided.
