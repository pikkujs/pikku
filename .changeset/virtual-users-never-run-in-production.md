---
'@pikku/core': minor
---

Virtual users no longer run against production. Starting a run, and enabling a schedule, is refused with a 403 in a production environment for every disposition, including `accountable`, which was the one disposition production used to accept. Turning a schedule off or editing a disabled one is still allowed, so a leftover schedule can be stopped.
