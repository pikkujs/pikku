---
type: decision
title: The generated realtime client holds no auth token and delegates it to the shared PikkuFetch
description: setAuthorizationJWT and setAPIKey forward to the PikkuFetch instance the client was given, so the token lives in one place
tags: cli, realtime, auth, client
---

# The generated realtime client holds no auth token and delegates it to the shared PikkuFetch

The generated realtime client in `packages/cli/src/functions/wirings/realtime/serialize-realtime-client.ts`
keeps no token field. Its instance fields are the socket, handlers, options and
reconnect state (`serialize-realtime-client.ts:69-74`).

Its doc comment says it "picks up its server URL + auth from this fetch, so you only
configure connection details in one place" (`serialize-realtime-client.ts:84-88`).
`setPikkuFetch` stores that instance (`serialize-realtime-client.ts:89-91`).

`setAuthorizationJWT` and `setAPIKey` forward the value to the PikkuFetch instance
(`serialize-realtime-client.ts:98-101`, `103-106`).

**What this rules out:** a second token store inside the realtime client that could
drift from the fetch instance that makes the HTTP calls.
