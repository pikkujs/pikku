---
'@pikku/cli': patch
---

Dropped the OpenCode-specific discovery guidance from the bundled agent skills.

Every skill's discover step told the agent to "prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command" — a distinction that no longer holds, so the step now just points at the `pikku meta` command. The `pikku-fabric` skill loses the same framing around its `pikku-meta` and database sections.

This is documentation shipped inside the package; `pikku skills install` still supports `--agent opencode`.
