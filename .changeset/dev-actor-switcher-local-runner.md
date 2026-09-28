---
'@pikku/cli': patch
---

The dev-actor-switcher hint now says who bakes `VITE_DEV_ACTORS` and `VITE_SCENARIO_ACTOR_SECRET`: a hosted sandbox dev server does it for you, a local runner has to do it itself, and a switcher that renders nothing locally is that missing half.
