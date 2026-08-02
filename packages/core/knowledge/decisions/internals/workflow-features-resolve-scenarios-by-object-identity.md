---
type: decision
title: A feature resolves its scenarios by object identity, never by name or shape
description: An unregistered scenario comes back explicitly unresolved rather than silently running as something else
tags: workflow
---

# A feature resolves its scenarios by object identity, never by name or shape

`resolveFeatureScenarios` in `feature.ts` builds a `Map` keyed by the registered
config object itself and looks each feature entry up in it. `pikkuScenario`
returns its config verbatim and `addWorkflow` registers that same object, so a
feature holding the imported identifier holds the very object that was
registered. Nothing is matched by shape, by name, or by any other guess.

That is also why a scenario built inline inside a feature — and therefore never
registered — comes back in `unresolved` rather than silently running as
something else. Because scenarios are referenced by imported identifier, a
renamed or deleted scenario is a compile error rather than a silent skip.

Entries are returned in declaration order and features in registration order,
since a feature's reading order is its declaration order. A scenario's effective
tags are its own unioned with the containing feature's, so a tag filter selects
through the feature.

**What this rules out:** falling back to name matching when identity lookup
misses, structurally comparing configs, or dropping unresolved entries silently
instead of reporting them — each turns "this scenario is not registered" into
"some other scenario ran instead".
