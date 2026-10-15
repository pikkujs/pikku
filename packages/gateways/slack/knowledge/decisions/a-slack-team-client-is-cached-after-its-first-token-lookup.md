---
type: decision
title: A Slack team's client is cached after its first token lookup
description: getClient resolves a team's bot token through tokenResolver only on a cache miss and keeps the WebClient; a rotated token is seen only after invalidateClient, and no caller of that method exists in the gateways or core packages
tags: [slack, tokens, caching]
---

# A Slack team's client is cached after its first token lookup

`SlackGatewayAdapter` keeps one `WebClient` per team in `clientCache`
(`packages/gateways/slack/src/slack-gateway-adapter.ts:80`).

`getClient(teamId)` returns the cached client when there is one
(`slack-gateway-adapter.ts:87-89`). On a miss it calls
`this.options.tokenResolver(teamId)` (`slack-gateway-adapter.ts:91`), throws
`No bot token found for team <id>` when the result is empty (`slack-gateway-adapter.ts:92-94`),
and stores the new client (`slack-gateway-adapter.ts:96-98`).

`invalidateClient(teamId)` deletes the cache entry (`slack-gateway-adapter.ts:102-104`).
Its doc comment names token rotation as the reason. A search of `packages/gateways`
and `packages/core` found no caller of `invalidateClient`, so in those packages a
rotated token is picked up only if something else calls it.

**What this rules out:** a token lookup on every event, and a rotated token taking
effect on the cached client without an `invalidateClient` call.
