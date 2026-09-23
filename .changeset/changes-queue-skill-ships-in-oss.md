---
'@pikku/skills': patch
---

Add `pikku-changes`, the skill for working a project's changes queue — the todo list someone files by walking a deployed stage. It covers the `pikku fabric changes list|claim|show|ask|shot|done` loop, how to read an item (their words first, then the screenshot, then the circled elements, and the source anchor only as a starting point), when a question is worth their context switch and when it is not, offering visual answers as `--kind option` attachments shot in one pass at one width, and the one-item-one-commit rule with the `Change-Id:` trailer that makes a single item revertable.

It lived only in Fabric's own repo, so the agents that had it were the ones working inside Fabric. The queue is driven by `pikku fabric changes`, which every OSS client already has, so the skill ships with the CLI in the `fabric` install group.
