---
type: question
title: What rules govern impersonation on staging and live?
description: Staged impersonation by a signed-in admin is wanted; the switch, read-only default, expiry and logging rules are proposed but not agreed
tags: auth, services
---

# What rules govern impersonation on staging and live?

Wanted: a signed-in admin on a deployed environment can impersonate a persona,
using the header on the normal cookie session. The code already applies
impersonation on that path (`auth-session.ts`, the human branch).

Not yet agreed:
- **Per-environment switch.** On for staging; off for production. The request
  is that it is off unless turned on for that environment.
- **Read-only by default.** Writes made while impersonating change real data.
- **Expiry.** An impersonation ends after a short time.
- **Logging.** Each impersonated request records the real admin and the target.
  Today the impersonation line is `info` and does not record the admin against
  each request.
- **Banner.** The panel shows "viewing as X".

Also unverified: the default impersonation gate reads the owner's scopes
(`userHoldsScopes(result.user.id, …)`), not the scopes of the key or session that
made the request.
