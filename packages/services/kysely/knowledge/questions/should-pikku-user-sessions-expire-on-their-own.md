---
type: question
title: Should pikku user sessions expire on their own?
description: The Kysely session store writes a session with no expiry, reads it back at any age, and its table has no expiry column
tags: [sessions, expiry, kysely]
---

# Should pikku user sessions expire on their own?

`KyselySessionStore` (`packages/services/kysely/src/kysely-session-store.ts`) writes a
session as JSON with an `updatedAt` stamp and nothing else (`kysely-session-store.ts:35-46`).
`get` returns the stored session whatever its age, and has no expiry check
(`kysely-session-store.ts:21-33`). `clear` deletes a user's row (`kysely-session-store.ts:48-53`).

The table has `pikkuUserId`, `session`, `createdAt` and `updatedAt`, and no expiry column
(`packages/services/kysely/src/schema/session.schema.ts:8-18`).

Current behaviour: a stored session stays readable until something calls `clear`.

Open: should a session expire in this store, or is its lifetime bounded somewhere else? The
files do not say.
