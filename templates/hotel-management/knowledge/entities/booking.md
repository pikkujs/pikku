---
type: entity
title: Booking
description: An intention to stay, which may never become a stay
resource: table:booking
tags: [front-desk]
---

# Booking

A booking is an *intention*. It becomes a stay when somebody checks in, and
plenty of bookings never do — they are cancelled, or nobody turns up.

That is why a booking carries a status rather than being deleted: "cancelled"
and "no-show" are different facts about the same night, and the difference
matters to whoever is deciding whether to charge for it.

## The words staff use

Reception says "arrival" for a booking arriving today and "in-house" for
somebody currently staying. Housekeeping says "departure" for a room being
vacated, and cares about the room rather than the booking attached to it.

Guests say "my booking" for the next one, which is worth remembering when
building anything that answers "cancel my booking".

## Rooms are assigned late

A booking is for a *room type*, not a room. The specific room is chosen at
check-in, so housekeeping and maintenance can move people around right up to
arrival — a room going out of service at 11am should not require rewriting
every booking that mentioned it.

A walk-in has no booking at all until one is made for them at the desk.
