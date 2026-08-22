---
'@pikku/services-better-auth': patch
---

Let a Fabric operator token be scoped to one stage.

Every stage verifies against the same `FABRIC_AUTH_PUBLIC_KEY`, so a token
carrying only an operator and a purpose is admin on all of them at once. That
was contained while the token never left the control plane, and stops being
contained the moment one is handed to a scenario run or CI.

`fabric()` now takes `audience` — the stage's own id, `FABRIC_STAGE_ID` in a
Fabric deploy. A token carrying `aud` is refused unless `audience` is configured
and matches, so a stage that has not been told who it is cannot be the weak one.
Tokens without `aud` behave exactly as before, which keeps the existing
server-to-server callers working while the claim rolls out.
