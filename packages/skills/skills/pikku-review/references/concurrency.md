# Twice, and at once

Everything runs twice eventually: a double click, a client retry, a workflow step. Ask what the second run does.

- Run the same call twice and compare. Does it charge, send or settle again?
- Is idempotency enforced by the database, or only by a read before a write? A read before a write loses the race.
- With two calls at once, can they overdraw, oversell or slip past a guard?
- Is the idempotency key stable and built from the data, never `randomUUID()` or `Date.now()`?
