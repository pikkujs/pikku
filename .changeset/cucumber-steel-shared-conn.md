---
'@pikku/cucumber': patch
---

browser world: share one remote-CDP (Steel) connection across all scenarios in a
run instead of reconnecting per scenario. Cucumber builds a fresh world per
scenario, so the previous per-world connect + closeAll teardown recycled the
shared remote browser every scenario and raced its session recycling, timing out
the next `connectOverCDP`. Now: connect once, each scenario gets its own context,
`closeAll` disposes only contexts on the CDP path, and a dropped connection
reconnects on the next scenario.
