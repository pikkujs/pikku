---
'@pikku/cli': patch
'@pikku/addon-console': patch
'@pikku/console': patch
---

feat(virtual-user): make a run's history readable

There was no way to ask what the virtual users had been doing. The scaffold
generated a way to start a run and a way to read one back by id, and
`VirtualUserRunStore.list()` — which takes a persona filter — had no caller at
all. The console's Virtual Users screen was built entirely from static meta, so
it could say who a persona was and what they could reach, and nothing about
whether anybody had ever turned them loose.

The scaffold now also generates `listVirtualUserRuns` and
`getVirtualUserRunSteps`, both behind the existing `virtualUser:read` scope —
the transcript is strictly more sensitive than the summary it belongs to, since
it carries the live ids and payloads the run actually sent.

The console reads the same two things through the console addon
(`console:getVirtualUserRuns`, `console:getVirtualUserRunSteps`) off the host's
own `virtualUserRunStore`, under a new `pikku:console:virtualUsers:read` scope.
Going through the store rather than the scaffolded RPCs means a project's runs
show up whether or not it turned `scaffold.virtualUser` on — wiring the store is
all a run has ever needed. A host with no store answers with an empty list
rather than an error: it has no runs, which is a true answer.

Each persona now shows its recent runs under the declaration — status, when,
steps and mutations, findings, disposition and seed — and opening one fetches
its transcript. The steps are fetched only on open, because the history is read
far more often than any single run is.
