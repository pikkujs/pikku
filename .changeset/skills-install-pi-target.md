---
'@pikku/cli': patch
---

`pikku skills install --agent pi` installs bundled skills into `.pi/skills/` for pi.dev (composes with `--only`/`--core`/`--fabric`/`--update`); per-agent install paths now come from one map, and `--agent` help lists only the agents that work.
