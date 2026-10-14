---
type: decision
title: A credential's read path follows its declared type, never a missing value
description: The credential wire service reads a wire credential only from the user's store and a singleton only from the deployment, so an absent user value never falls back to the deployment's token
tags: core, credentials, wire, singleton
---

# A credential's read path follows its declared type, never a missing value

`packages/core/src/services/credential-wire-service.ts` decides where each
credential is read from. The doc comment says the choice is "decided by what the
credential IS — its declared type, as the wiring may have overridden it — and
never by whether a per-user lookup came back empty", because an absence-driven
fallback "would let a user who has not connected read the deployment's own token"
(`credential-wire-service.ts:6-10`).

The resolution type is `{ mode: 'wire' } | { mode: 'singleton' }`
(`credential-wire-service.ts:12`).

In `doLoad`, the user's store is read with `getAll(userId)`, and any name the
resolution marks `singleton` is skipped (`credential-wire-service.ts:103-104`).
The comment says this stops a user "in charge of a slot the deployment owns"
(`credential-wire-service.ts:116-121`).

`loadDeploymentCredentials` fetches only `singleton` names from the deployment
service (`credential-wire-service.ts:137-143`). A `wire` name is skipped there
(`credential-wire-service.ts:138`), and the comment says a wire credential "can
never pick up a platform value" (`credential-wire-service.ts:127-130`).

**What this rules out:** a `wire` credential falling back to the deployment's
value when the user has none, and a user's stored value being imported under a
name the deployment declared as `singleton`.
