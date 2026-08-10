---
type: decision
title: A virtual user is never offered a scenario, platform or addon step
description: Being able to invoke "the webhook arrives" lets the user manufacture the outcome it exists to discover, which invalidates every finding downstream
tags: core, virtual-user
---

# A virtual user is never offered a scenario, platform or addon step

`deriveVirtualUserCatalogue` excludes scenario bodies and their steps, and
platform and addon steps, from what a virtual user may call.

For scenario bodies the argument is only efficiency: they are held out of every
deployed unit and are not network-callable, so offering one wastes a turn on a
404.

For a platform or addon step the argument is the oracle itself. A virtual user's
findings are worth something *because* it cannot manufacture the outcomes it is
meant to discover. A user that could invoke "Stripe's webhook arrives" forges its
own payment success, and every finding downstream of that forgery is worthless —
not merely unreliable, but actively misleading, because it looks like evidence.

This is the same class of argument as `allowApprovalRequired` defaulting to
false, and it is enforced here at derivation rather than left to convention.

**What this rules out:** exposing platform steps behind a flag "for
convenience", or filtering them later in the run loop where a caller could skip
the filter.
