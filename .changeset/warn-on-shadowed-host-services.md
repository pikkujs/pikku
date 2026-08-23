---
'@pikku/cli': patch
---

Warn when `createSingletonServices` returns a service the host already passed in

`pikkuServices` merges `{ ...existingServices, ...createdServices }`, so a
factory that builds its own `secrets` (or `kysely`, or `content`) wins over the
one the host configured — silently. The replacement starts empty and the first
failure lands much later, somewhere unrelated, with nothing in the boot log
pointing at the swap. The generated wrapper now names what it discarded and
points at the `existingServices.x ?? new Own()` idiom the templates use.
