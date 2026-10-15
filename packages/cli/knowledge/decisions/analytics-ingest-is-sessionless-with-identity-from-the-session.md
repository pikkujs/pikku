---
type: decision
title: Analytics ingest is sessionless and takes identity from the session, never the body
description: The generated analytics ingest route is auth false, and the record call receives only the event and client time, while core stamps the user from the session
tags: cli, analytics, auth
---

# Analytics ingest is sessionless and takes identity from the session, never the body

The generated ingest function in `packages/cli/src/functions/wirings/analytics/serialize-analytics.ts`
is `auth: false` (`serialize-analytics.ts:140-141`). The comment says that is necessary because most
measured visitors are anonymous, and that identity is stamped from the session and never read from
the body (`serialize-analytics.ts:133-139`).

The handler passes each event and its client time to `analytics.record`, and nothing else
(`serialize-analytics.ts:147-149`). The identity is built in core: the analytics record builder reads
`userId` and `orgId` from `wire.session` and sets `userIdentity` (`packages/core/src/analytics/analytics.ts:59`,
`analytics.ts:67-69`).

**What this rules out:** a caller naming a user or org in the event body to attribute events to them.
