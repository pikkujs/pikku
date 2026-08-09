---
type: decision
title: A scenario step's prose template is offered to a virtual user unfilled
description: A reporter fills placeholders from a run that happened; there is no run yet, and the filled form would answer the question the user is there to answer
tags: core, virtual-user
---

# A scenario step's prose template is offered unfilled

When a scenario step becomes a catalogue entry, its prose template goes in with
its placeholders intact — braces and all.

A reporter fills those placeholders from a run that already happened. There is
no run yet at derivation time, so there is nothing to fill them from. More
importantly, filling them would answer the wrong question: "invites {email}"
tells the user to choose someone, where "invites ada@example.com" tells it whom
— and *whom* is the scenario author's answer, not something the virtual user
worked out.

**What this rules out:** substituting example or fixture values to make the
catalogue read more naturally. It reads better and tests less.
