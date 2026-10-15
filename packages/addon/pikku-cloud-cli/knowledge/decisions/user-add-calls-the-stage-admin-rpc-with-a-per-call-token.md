---
type: decision
title: CLI user add creates end users on a deployed stage with a per-call operator token
description: pikku cloud user add mints a short-lived operator token for the stage and posts admin:createUser to the stage's /api/rpc endpoint directly, without a broker
tags: cli, cloud, users, auth
---

# CLI user add creates end users on a deployed stage with a per-call operator token

`CloudUserAdd` in `packages/addon/pikku-cloud-cli/src/functions/user-add.function.ts` requires a token and a
linked project (`user-add.function.ts:51-59`). The comment says the stage operator token is minted per
call so nothing durable holds a stage credential (`user-add.function.ts:81-82`). It calls
`createStageOperatorToken` and gets back the token and the stage's app URL (`user-add.function.ts:83-85`).

It then posts `admin:createUser` to `${appUrl}/api/rpc/...` with that token as a bearer
(`user-add.function.ts:92-100`). The comment says the call goes to the stage directly rather than
through a broker (`user-add.function.ts:36-43`). The doc comment also says the token carries the
`admin` and `virtualUser` roots; those scopes are minted server-side and are not visible in this file.

**What this rules out:** storing a long-lived stage credential in the CLI. Each run mints its own.
