---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku audit` gains `--fail-on <severity>` and `--baseline <audit.json>`. With `--fail-on`, an advisory at or above that severity that the baseline does not list fails the run, and so does an audit that could not produce a report.
