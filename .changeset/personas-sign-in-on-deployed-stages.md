---
'@pikku/core': minor
---

Let personas run against a deployed stage.

A persona could only ever sign in through the actor plugin, which is
passwordless and therefore a local-development mechanism — so the scenario
suite had no way to reach staging or production, including the parts of it
that never assert anything about a logged-in user.

`HttpPersonasConfig` now takes `operator` as an alternative to `secret`. Given
Fabric operator credentials, a persona signs in at `/auth/sign-in/fabric` and
acts as its account through the `x-pikku-impersonate-user-id` header, which is
gated on the umbrella `admin` scope rather than `user.role`. Nothing on the
deployed side holds a test credential: the stage verifies operator tokens and
cannot mint them.

Provisioning stays opt-in (`createMissing`), so pointing a run at a live
environment never quietly writes user rows into it.
