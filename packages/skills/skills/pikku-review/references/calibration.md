# Calibration

Test a reviewer before trusting it: plant these in a copy of the best app you have, without saying where, and count what it finds. No app is spotless, so list what is already wrong in it first. A reviewer that misses the first three is not ready.

Also plant decoys: correct code that looks suspicious. A reviewer that calls everything a bug would otherwise score perfectly, so count false alarms as well as catches.

Entries 1, 9 and 10 depend on generated routes being open. Once Pikku closes those, recreate them by opening the route in the app, or run them on a pinned version.

Each entry is a bug seen in real code.

1. **Anonymous settlement.** A workflow with approval gates, reachable through the generated start and approve routes, with `approvers` left at default. Two anonymous approve calls settle a deposit in full.
2. **Wrong row.** A lookup for the current rent has no `kind` filter, so a small bill prints as the rent on an official letter.
3. **Double settle.** A money write has no guard, so a second call settles again with a different result.
4. **Regex date.** `2026-13-99` passes the input check, then a later step throws after writing, leaving the record stuck.
5. **Email before stamp.** A sweep sends mail, then writes the sent time. A crash between them sends it again the next day.
6. **One bad item.** A single loop with no isolation: a throw on one booking stops every later booking that day.
7. **Half a delete.** A delete is not in a transaction and ignores two related tables, emptying the parent before failing.
8. **Swallowed notifier.** A notifier failure counts as success, so a retry never happens.
9. **Open stream.** An addon stream route is anonymous and sends run data to anyone holding a run id.
10. **Ownerless run.** An ownership check passes for a run with no recorded owner, so sessionless runs are open.
