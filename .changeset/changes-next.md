---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku fabric changes next` blocks until the changes queue has work — an item past its grace window, or an answer to a question the `--claimed-by` claimant asked — prints it and exits, so a coding agent runs it in the background instead of polling. `--claim` takes what it found as one group, `--stage` narrows to a stage by branch, URL or id, and `--timeout`/`--once` exit 2 when nothing turns up; a refused session exits 3. `list` also takes `--stage`, `show 2`/`show #2` and short ids everywhere a change is named now resolve, and a 409 from `claim` says per item why it could not be taken. The `pikku-changes` skill is rewritten around that loop.
