---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/skills': patch
---

Drop `scenario.step` — a scenario step is now always a `given`, `when` or
`then`.

`step` rendered no keyword, which made it the phase to reach for whenever a
step did not obviously fit one of the three. That is exactly the step a reader
cannot check: a scenario is read by people deciding whether it describes the
behaviour they wanted, and a row that says what it does without saying whether
it is setup, action or claim tells them nothing to agree or disagree with. It
was also the escape hatch from the assertion lint — a scenario with no `then`
could be made to stop complaining by demoting its steps rather than by
asserting anything.

Replace `scenario.step(...)` with whichever of `given`, `when` or `then` the
step actually is. `then` is not a rename: it makes the step's bindings
witnesses rather than alternatives, so every declared surface runs and they
must agree.
