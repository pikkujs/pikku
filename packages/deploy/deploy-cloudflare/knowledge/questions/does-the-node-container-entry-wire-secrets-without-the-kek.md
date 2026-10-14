---
type: question
title: Does the Node container entry wire secrets when PIKKU_SECRET_KEK is unset?
description: The container platform-services block says contributors gated on PIKKU_SECRET_KEK wire secrets, but no such gate is in this repo
tags: [deploy, cloudflare, secrets, container]
---

# Does the Node container entry wire secrets when PIKKU_SECRET_KEK is unset?

`generateServerPlatformServicesBlock` in `packages/deploy/deploy-cloudflare/src/adapter.ts`
(lines 329-341) builds `createPlatformServices` for the Node container entry. Its doc
comment (lines 334-336) says `env` is `process.env` and that contributors gated on
`env.DATABASE_URL` / `env.PIKKU_SECRET_KEK` "wire kysely + secrets exactly as they do on
the worker".

The same file mentions `PIKKU_SECRET_KEK` again only in a comment about the worker
(line 268). Searching the non-dist sources of `packages/` for `SECRET_KEK` finds no code
that tests the variable: the other hits are `packages/services/kysely/src/kysely-secret-service.ts:197`
(a comment about a decrypt failure) and two CHANGELOG files. So the contributor that the
comment describes is not in this repo,; I did not find it in this repo.

Question: when `PIKKU_SECRET_KEK` is unset, does the container entry leave secrets unwired,
and does it fail at startup or on first access? This repo does not show it.
