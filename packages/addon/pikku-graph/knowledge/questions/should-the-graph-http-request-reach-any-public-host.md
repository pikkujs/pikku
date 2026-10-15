---
type: question
title: Should the graph httpRequest node reach any public host when no secret or allowlist is set?
description: httpRequest is sessionless and takes a caller-chosen URL; safeFetch refuses private addresses but applies no allowlist by default, and a secret's host binding applies only when the secret declares allowed hosts
tags: graph, http, ssrf, secrets
---

# Should the graph httpRequest node reach any public host when no secret or allowlist is set?

`httpRequest` (`packages/addon/pikku-graph/src/functions/network/http-request.function.ts:64-68`)
is a `pikkuSessionlessFunc`, with no `auth` or `scopes` in its definition. It builds
`new URL(data.url)` from the input (`http-request.function.ts:70`) and sends it
through `httpRequester.request`, passing `auth` and `userId` (`http-request.function.ts:87-98`).

`PikkuHttpRequesterService.request` attaches a credential only when `auth` is set
(`packages/addon/pikku-graph/src/http-requester.service.ts:50`). For a credential
it calls `assertSecretAllowedForHost` (`http-requester.service.ts:60-65`). Without
`auth`, it goes straight to `safeFetch(url.toString(), ...)` with no options
(`http-requester.service.ts:85-89`).

`safeFetch` with no options accepts any host that is not a private address
(`packages/core/src/utils/safe-fetch.ts:203-206` and `safe-fetch.ts:257-273`).
`assertFetchableUrl` rejects any scheme other than `http:` or `https:`
(`safe-fetch.ts:262-264`). With no allowlist it rejects private hosts
(`safe-fetch.ts:266-273`) and accepts every other host.

For a secret, `assertSecretAllowedForHost` (`packages/core/src/services/secret-host-binding.ts:41-50`)
passes a secret with no `allowedHosts` unless `requireAllowedHosts` is set
(`secret-host-binding.ts:42-45`). The graph service sets that flag from
`config.secrets.requireAllowedHosts` (`packages/addon/pikku-graph/src/services.ts:10`).

The question is whether an unauthenticated `httpRequest` is meant to reach any
public URL. The code allows it. The comment on the file explains only why secret
values stay out of workflow state (`http-request.function.ts:4-8`), and says nothing
about the reach of a request with no `auth`.
