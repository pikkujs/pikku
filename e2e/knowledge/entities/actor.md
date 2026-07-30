---
type: entity
title: Actor
description: One body that signs in, as opposed to the kind of person it is
tags: scenarios
---

# Actor

An actor is **one body that signs in**, with an email of its own. A persona is
the **kind** of person — what someone is like and what they are trying to do.

The two are not the same set, and the moment a scenario needs two people of the
same kind — one banning, one banned — it needs two actors and still only one
persona. That is why this project declares `scenarios.actors` in
`pikku.config.json` and leaves `scenarios.personas` empty: every actor here is
already a distinct body, and none of them share a kind.

What each actor holds is not written down here. The declaration is the truth —
`pikku.config.json` for scopes and roles, `src/seed-scopes.ts` for what the seed
composes — and a second list would be a copy that drifts the first time a suite
needs one more grant.

Actors matter to the knowledge base because scenarios are written in the third
person about them: `Given 'guest' holds the report-viewer role`. Quoting the name
is what keeps a scenario readable without knowing whose session is running it.
