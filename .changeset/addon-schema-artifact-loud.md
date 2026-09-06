---
'@pikku/cli': patch
---

An addon now publishes its schema artifact on every `pikku all`, empty when it
has no tables, and `db generate` refuses an addon that publishes none at all.

The two used to be one case. A wired addon whose artifact could not be resolved
was read as an addon that ships no schema — no error, no migration — so a
mispackaged `exports` entry surfaced much later, as an addon function querying a
table nobody had created. Making the file unconditional separates "needs
nothing" from "cannot say", and a malformed artifact is now rejected rather than
half-applied.
