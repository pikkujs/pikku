---
'@pikku/skills': patch
---

Drop OpenCode-specific discovery guidance from the bundled skills

Step 1 of the execution checklist in 43 skills opened with "Prefer OpenCode
tools such as `pikku-meta` when available; otherwise run the relevant
`pikku meta ... --json` command". The skills ship to every agent that reads
them, most of which have no such tools, so the preferred branch was dead
advice that an agent had to reason past before reaching the instruction that
actually applies.

The step now just says to run `pikku meta ... --json`. The README still notes
that the frontmatter shape is the one Claude Code, opencode and pi.dev all
parse — that is a compatibility fact about the format, not a routing hint.
