---
type: question
title: Does an adversarial user's in-scope success count as a finding?
description: The disposition doc says a 2xx is a finding for an inverted oracle, but the engine only flags successes outside the virtual user's scopes, and in-scope 2xx depends on the app's classifier
tags: core, virtual-user, authorization
---

# Does an adversarial user's in-scope success count as a finding?

`dispositionProfile` in `packages/core/src/wirings/virtual-user/virtual-user-dispositions.ts`
documents `invertedOracle` as meaning "a 2xx is a finding rather than a success".
The comment on the field says the engine "flags the success and leaves ownership
to the app's classifier".

In `run-virtual-user.ts` the flag does one thing: at line 302 it drops the
scope narrowing, so an adversarial user is offered the whole catalogue. The
finding that fires on a 2xx is the `unexpected-success` check around lines
627-645. It requires `response.ok` and a scope the virtual user does not hold. A
2xx on an endpoint the virtual user is entitled to produces no engine finding. Only the
app's `classify` hook can flag it, and that is the ownership check the comment
describes.

So the flag's name and doc describe a stronger oracle than the engine applies.
What is asked: should `invertedOracle` make every 2xx a finding in the engine, as
its doc says, or is the classifier meant to be the only place a 2xx becomes a
finding, with the doc corrected?
