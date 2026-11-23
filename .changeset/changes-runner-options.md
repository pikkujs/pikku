---
'@pikku/cli': patch
---

The changes runner takes host options. An agent start and its prompt context carry the change's `specialist` and the `route` it was started from. `ChangesRunner.refill()` looks for newly ready changes now. `step: true` claims and builds the first changes, claims no more and merges nothing until the host calls `mergeFinished()`; the run ends with `stepped: true` and is not an error. `extraRoutes` lists `pikku changes next` routes (`intake`, `knowledge`, `upgrade`) that are built instead of ending the run. The counters (`counters`: tries, conflict tries, turns, repairs) are readable and settable between runs, and `run()` after an ended run continues from them. Stall and limit messages name the option that set the limit.
