---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
'@pikku/console': patch
---

Let a scenario declare why it is held out of a default run.

`pikkuScenario({ skip: 'why' })` keeps the scenario in the plan and reports it as `SKIP <name> (<reason>)` on the ladder, instead of the alternatives available until now: deleting it, commenting it out, or leaving it red. Naming it directly with `--flows` clears the quarantine and runs it; selecting the feature it belongs to does not, because a feature is a group and running the group should not silently drag a quarantined member in.

The run report's `skipped` list now carries a reason per scenario rather than assuming `--no-browser`, so a browser scenario held back on a machine with no browser reads differently from one the project quarantined itself.

`@pikku/console` gains a test id on the addon detail page's Setup tab, which was previously only reachable through its translated label.
