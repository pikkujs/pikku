---
type: decision
title: Running a flow and editing a flow are different scopes
description: Why the on-call operator cannot change the flow that paged them
resource: scope:runs:cancel
tags: [authorization, rbac]
---

# Running a flow and editing a flow are different scopes

`operator` holds `flows:run`, `runs:cancel` and `runs:replay`. It does **not**
hold `flows:write`. `builder` is the mirror image.

## What that rules out

The 3am fix. Somebody paged about a failing flow, with the editor one click
away, will change the flow — and the change will be made by a tired person with
no context on why it was written that way, under pressure to stop the alert.
That fix becomes the next morning's outage.

Splitting the scopes means the person on call can do every *containment* action
— cancel the run, replay it once the upstream recovers, disconnect a
credential — and cannot author. Authorship happens in daylight, by whoever owns
the flow, with the run history as evidence.

## What it costs

Genuine emergencies where the flow really is wrong now need two people. That is
the accepted trade, and it is why `admin` exists: one role holds both, granted
deliberately rather than by default.

## Why this is a scope and not a code branch

A flow can reach every system this platform is connected to. "Who may start
this" is therefore the most consequential question the system asks, and it needs
to be answerable without reading a function body — from the role declaration,
and from `pikku scopes audit`.
