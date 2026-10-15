---
type: question
title: Should pikku user sessions expire on their own?
description: The MongoDB session store has no expiry field and creates no TTL index, so a stored session is readable at any age
tags: [sessions, expiry, mongodb]
---

# Should pikku user sessions expire on their own?

`MongoDBSessionStore` (`packages/services/mongodb/src/mongodb-session-store.ts`) defines
its document as `_id`, `session`, `createdAt` and `updatedAt`, with no expiry field
(`mongodb-session-store.ts:5-10`). `init` only binds the `pikkuUserSessions` collection
and creates no index (`mongodb-session-store.ts:18-23`). `get` returns the stored session
whatever its age (`mongodb-session-store.ts:25-31`). `set` upserts the session and stamps
`updatedAt` (`mongodb-session-store.ts:33-43`).

Current behaviour: a session stays readable until `clear` removes it
(`mongodb-session-store.ts:45-47`).

Open: should a session expire in this store, for example through a TTL index, or is its
lifetime bounded elsewhere? The file does not say.
