---
type: question
title: Who calls provisionPersonas?
description: provisionPersonas is additive and can ban orphans, but no caller exists in this repo outside tests and skill docs, so the production path is unknown
tags: better-auth, actor, personas, provisioning
---

# Who calls provisionPersonas?

`provisionPersonas` (`packages/services/better-auth/src/provision-personas.ts`)
creates persona actor rows, grants their roles, and handles orphans. Orphans are
reported by default, or banned when the `ban` option is set and the ban plugin
exists. It never deletes or revokes.

A search of this repo finds callers only in tests and skill documentation. The
function that does the provisioning in a real deployment is not in this repo.

Open: which deployment path runs it, and when? Until that is known, the orphan
policy and the refusal rules (a real non-actor user at a persona email throws)
are untested in production.
