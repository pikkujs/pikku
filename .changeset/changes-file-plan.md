---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku changes file --plan <file.json>` (or `--plan -` for stdin) files a whole plan in one call: an array of `{ ref, title, body, specialist, dependsOn }`. The plan is checked whole and refused with every problem named (unknown or duplicate refs, cycles, a missing specialist, a body with no "done when"/"you can" outcome, a first change that is not the data change every other one depends on, frontend changes with no `mock: true` functions or reason for none, any other field such as a question), or filed whole, each `dependsOn` ref becoming the real id. The intake route of `pikku changes next --prompt` and the pikku-changes skill now file with `--plan` and no longer tell the intake agent to `ask`.
