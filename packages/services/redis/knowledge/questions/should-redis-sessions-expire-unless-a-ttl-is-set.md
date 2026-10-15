---
type: question
title: Should Redis sessions expire unless a TTL is set?
description: The Redis session store applies an expiry only when ttlSeconds is given, and it is undefined by default, so a session written without one never expires
tags: [sessions, expiry, redis]
---

# Should Redis sessions expire unless a TTL is set?

`RedisSessionStore` (`packages/services/redis/src/redis-session-store.ts`) documents
`ttlSeconds` as an optional TTL for session entries (`redis-session-store.ts:11-15`). The
constructor stores it as given, so it is undefined when the caller omits it
(`redis-session-store.ts:16-22`). `set` passes `EX` to Redis only when `ttlSeconds` is
set, and otherwise writes the key with no expiry (`redis-session-store.ts:52-59`).

Current behaviour: a session written without a TTL stays in Redis until `clear` deletes it.

Open: is "no expiry unless configured" the intended default for sessions, or should a
default TTL apply? The file documents the option but does not choose a default.
