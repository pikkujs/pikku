---
type: question
title: Is /auth/sign-in/fabric served by anything in OSS?
description: The operator sign-in path posts to /auth/sign-in/fabric by default, but no endpoint definition exists in the OSS repos searched, so the server side is unverified
tags: core, better-auth, operator, sign-in
---

# Is /auth/sign-in/fabric served by anything in OSS?

`establishOperatorSession` in `packages/core/src/services/persona-sign-in.ts`
posts `{ token, actAs: { email } }` to `/auth/sign-in/fabric` by default and
reads `actAs.userId` back. The RS256 operator token is what the server checks.

A search finds the path only in core's http-personas, persona-sign-in, the
playwright provider and the CLI's fabric code. No OSS endpoint definition serves
it.

Open: which server accepts the operator token, and does it live only in Fabric?
If so, OSS operator sign-in cannot be verified end to end here.
