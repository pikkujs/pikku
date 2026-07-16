---
'@pikku/cli': patch
---

`pikku skills install --agent pi` — install bundled skills for pi.dev.

Skills are copied into `.pi/skills/`, which is where pi resolves project-local skills (`<cwd>/<CONFIG_DIR_NAME>/skills`, with `CONFIG_DIR_NAME` defaulting to `.pi`). `pikku skills list` now also reports skills installed there as present, and `--agent pi` composes with `--only`, `--core`, `--fabric` and `--update` like the other targets.

The per-agent install paths now come from one map rather than being spread across ternaries, so the supported-agent list, the install root, the destination label, and the installed-skill scan cannot drift apart.

Also corrects the `--agent` help, which advertised `codex | gemini` — both of which are rejected at runtime. It now lists the agents that actually work: `claude | opencode | pi`.
