---
type: decision
title: Only housekeeping closes a housekeeping task
description: Why the front desk can see the board but not clear it
resource: scope:housekeeping:complete
tags: [authorization, rbac]
---

# Only housekeeping closes a housekeeping task

`receptionist` holds `housekeeping:read`. `housekeeper` holds
`housekeeping:complete`. Neither holds the other.

## What that rules out

A receptionist with an arrival waiting and a dirty room in front of them has an
obvious incentive to mark it clean and move on. The scope split means they
cannot, so the board keeps saying what is true rather than what somebody needed
to be true at 3pm.

This is not distrust of receptionists. It is that "the room is clean" is a
claim only the person who cleaned it can make, and a system that lets anyone
make it stops being able to answer the question.

## What it costs

A room that *is* clean but whose task nobody closed will sit on the board
looking dirty, and reception cannot fix it themselves. That is the accepted
trade: a stale board is visible and annoying, whereas a board anyone can edit is
quietly wrong.

The escape hatch is a manager, who holds `housekeeping` whole.

## Related

The same shape appears in bookings: `bookings:checkin` is the front desk's, and
a guest holds no such scope, so self check-in is a scope grant away rather than
a code change.
