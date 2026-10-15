---
type: decision
title: The change-events stream sends the bearer token and stops retrying on 401 and 403
description: subscribeToChanges sends the Pikku Studio Cloud token on each connection and treats 401, 403, 404, 405 and 501 as permanent, falling back to polling
tags: cli, cloud, events
---

# The change-events stream sends the bearer token and stops retrying on 401 and 403

`subscribeToChanges` in `packages/cli/src/cloud/lib/changes-events.ts` opens an SSE stream
for `changes:<projectId>` and sends `Authorization: Bearer <token>` on each attempt
(`changes-events.ts:94-96`).

`PERMANENT` is the set `401, 403, 404, 405, 501` (`changes-events.ts:34`). When a response has
one of those statuses, the loop logs that events are unavailable and polling is used instead,
and it returns without retrying (`changes-events.ts:99-104`).

**What this rules out:** retrying an unauthorized stream with backoff. A revoked or
unauthorized token ends the stream on the first response and does not keep reconnecting.
