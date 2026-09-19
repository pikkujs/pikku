---
'@pikku/cli': minor
---

Add `--agent-dir` and `--agent-skill-dir` to `skills install`, for a host whose agents do not live beside its skills. A harness that discovers subagents from a global directory can now project straight into it instead of writing into the user's repository, and one that relocates the installed skills afterwards can tell the projected agents where those skills will end up.
