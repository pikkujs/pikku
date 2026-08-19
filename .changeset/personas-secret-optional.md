---
'@pikku/cli': patch
---

Generate `SCENARIO_ACTOR_SECRET` as an optional secret. A stage that runs no
scenarios is a supported state — the actor sign-in refuses every request — but
the required declaration failed the deploy config gate on every such stage.
