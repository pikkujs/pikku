---
type: entity
title: Order
description: A basket that has been paid for
resource: table:order
tags: [checkout, fulfilment]
---

# Order

An order is a basket that has been paid for. Before payment it is a basket;
after payment it is an order and it stops changing.

Staff say "order" for the whole thing and "line" for one item on it. Customers
say "my order" for the most recent one and "my orders" for the history — worth
knowing, because "cancel my order" from a customer nearly always means the most
recent one, and from support nearly always means a specific id they are looking
at.

## Statuses

`pending` → `paid` → `shipped`, with `cancelled` reachable from `pending` and
`paid` only. A shipped order is not cancelled; it is returned, which is a
different thing the shop does not do yet — see the wishlist.

## Why cancelling restores stock

Stock is decremented when the order is placed, not when it ships, so a
cancellation has to give it back. The alternative — decrementing on despatch —
means two shoppers can buy the last item and one finds out days later, which is
a worse failure than briefly over-reserving.
