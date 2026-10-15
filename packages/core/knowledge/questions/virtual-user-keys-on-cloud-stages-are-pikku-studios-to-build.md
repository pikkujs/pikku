---
type: question
title: Pikku Studio Cloud has to create, hold and deliver the stage virtual user keys
description: This repo defines the variables and verifies statements; generating a pair per stage and signing for stage callers is Pikku Studio Cloud work that has not been done or checked
tags: services
---

# Pikku Studio Cloud has to create, hold and deliver the stage virtual user keys

The Pikku Studio Cloud repository is not on the machine this was built on, so none of the
following is built or confirmed. Pikku Studio Cloud must:

1. Generate one Ed25519 key pair per stage at creation and keep the private key in its
   backend, never on the stage.
2. Set the stage variable `VIRTUAL_USER_VERIFY_KEY` to the public key (SPKI DER,
   base64), and accept that name, which starts with neither `PIKKU_` nor `PIKKUSTUDIO_`.
3. Set `VIRTUAL_USER_API_URL` on every stage that runs virtual users, to the public
   URL including any HTTP prefix.
4. Sign statements with the stage's private key for callers acting on a stage, or hand
   the key to the CLI as `VIRTUAL_USER_SIGNING_KEY` through the channel it already uses
   for stage credentials.
5. Stop sending the operator token field in `runVirtualUser` requests; the field no longer
   exists.
6. For the stage switcher, sign a statement for the chosen virtual user and pass it to
   `/sign-in/switch-virtual-user` as `statement`.

Unverified: that Pikku Studio Cloud accepts an arbitrary unreserved variable per stage, that a
Worker can fetch its own public hostname (the run needs this on Workers), and that the
`audience` plugin option copes with a proxy that rewrites the origin. A run without a
sign-in path reads roles from the `getMyScopes` RPC and falls back to
`/auth/get-session`.

**What would settle it:** Pikku Studio Cloud landing the six items, and one stage run end to end.
