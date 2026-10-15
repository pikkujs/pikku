---
type: question
title: Fabric has to create, hold and deliver the stage virtual user keys
description: This repo defines the variables and verifies statements; generating a pair per stage and signing for stage callers is Fabric work that has not been done or checked
tags: services
---

# Fabric has to create, hold and deliver the stage virtual user keys

The Fabric repository is not on the machine this was built on, so none of the
following is built or confirmed. Fabric must:

1. Generate one Ed25519 key pair per stage at creation and keep the private key in its
   backend, never on the stage.
2. Set the stage variable `VIRTUAL_USER_VERIFY_KEY` to the public key (SPKI DER,
   base64), and accept that name, which starts with neither `PIKKU_` nor `FABRIC_`.
3. Set `VIRTUAL_USER_API_URL` on every stage that runs virtual users, to the public
   URL including any HTTP prefix.
4. Replace the operator sign-in route and `FABRIC_OPERATOR_TOKEN` handling: sign
   statements with the stage's private key for callers acting on a stage, or hand the
   key to the CLI as `VIRTUAL_USER_SIGNING_KEY` through the channel it already uses
   for stage credentials.
5. Stop sending `operatorToken` in `runVirtualUser` requests; the field no longer
   exists.
6. For the stage switcher, sign a statement for the chosen virtual user and pass it to
   `/sign-in/switch-virtual-user` as `statement`.

Unverified: that Fabric accepts an arbitrary unreserved variable per stage, that a
Worker can fetch its own public hostname (the run needs this on Workers), and that the
`audience` plugin option copes with a proxy that rewrites the origin. A run without a
sign-in path reads roles from the `getMyScopes` RPC and falls back to
`/auth/get-session`.

**What would settle it:** Fabric landing the six items, and one stage run end to end.
