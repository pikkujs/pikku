---
'@pikku/cli': patch
---

Declare `SCENARIO_ACTOR_SECRET` from the personas scaffold instead of leaving every project to hand-write it. Nothing in app code reads the actor sign-in secret — the scenario service, `pikku scenario`, `pikku persona`, `pikku persona sync` and the Playwright provider do — so a project that declares personas now gets a generated `pikku-personas-secrets.gen.ts` beside its personas file, and the platform collects the value the way it already collects `BETTER_AUTH_SECRET`. The file is removed again when the last persona goes.

The post-auth secret/credential/variable re-run is now a post-scaffold re-run, gated on personas as well as auth. Both scaffolds write `defineSecret` calls after `pikkuSecrets` has already read the inspector state, so without it the declaration only appeared on a second `pikku` run — and a cold project would deploy without ever being asked for the value.
