---
type: overview
title: Questions
description: Things asked of the Redis stores and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated, so the
doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Should Redis secret access leave an audit trail?](should-redis-secret-access-leave-an-audit-trail.md) — The Redis secret service has no audit option and records no read, write, delete or rotation, unlike the Kysely and MongoDB secret services
- [Should Redis sessions expire unless a TTL is set?](should-redis-sessions-expire-unless-a-ttl-is-set.md) — The Redis session store applies an expiry only when ttlSeconds is given, and it is undefined by default, so a session written without one never expires
<!-- /pikku:knowledge-index -->
