---
type: question
title: Who calls provisionVirtualUsers?
description: provisionVirtualUsers is additive and can ban orphans, but no caller exists in this repo outside tests and skill docs, and the route its doc comment names no longer exists
tags: better-auth, virtual-users, provisioning
---

# Who calls provisionVirtualUsers?

`provisionVirtualUsers` (`packages/services/better-auth/src/provision-virtual-users.ts`)
creates virtual user accounts, grants their roles, and handles orphans. Orphans
are reported by default, or banned when `orphans: 'ban'` is set and the ban
plugin exists. It never deletes or revokes.

A search of this repo finds callers only in tests and skill documentation. Its
doc comment says it is meant to be called by an operator sign-in route on a
handshake that names an unknown address, but that operator sign-in was removed
when virtual user callers moved to signed statements, so the comment names a
caller that does not exist.

Open: which deployment path runs it now, and when? Until that is known, the
orphan policy and the refusal rules (a real, non-virtual-user account at a
virtual user's email throws) are untested in production.
