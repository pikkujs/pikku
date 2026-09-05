---
'@pikku/skills': patch
---

Add the `pikku-blueprint-to-fabric` and `pikku-admin-to-fabric` skills, which rebuild a legacy app (and its generated back-office admin) as a Fabric app from a `.knowledge/` Product Blueprint.

Both skills were written against an older corpus, so every cross-reference is repointed at the skill that owns the material today: `pikku-queue`/`pikku-cron`/`pikku-http` to `pikku-wiring`, `pikku-better-auth` to `pikku-auth`, `pikku-react-query` to `pikku-react`, `pikku-feature` to `pikku-build`. Four steps named skills that no longer exist at all and are rewritten rather than repointed — the post-clone cleanup, the AOP verification loop, versioning, and the Stage 9 parity check. The stale `wireVariable`/`wireSecret` names are corrected to `defineVariable`/`defineSecret`.

`scripts/inventory.mjs` now exits non-zero with the reason when the blueprint directory is missing, a required file is absent, a file is unparseable, or an expected array has the wrong shape. It previously swallowed all of those and printed a table of zeros, which reads as a small app rather than an unusable blueprint.
