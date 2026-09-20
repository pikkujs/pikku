---
'@pikku/knowledge': patch
'@pikku/skills': patch
'@pikku/cli': patch
---

Project the pipeline skills into verified subagents.

A skill declares `agent:` in its frontmatter — tools, timeout, and the
`acceptance` block a host acts on — and `pikku skills install --agent pi`
writes one agent per skill that has it. `--agent-extensions` passes the
host's own extensions through, for a host that fences its writers or
routes their model.

`pikku knowledge next` gains `--require`, naming the action kinds that
count as done. Without it the exit code is always 0, because "there is
work left" is the normal answer — so a post-condition pointed at a bare
`next` asserts nothing.
