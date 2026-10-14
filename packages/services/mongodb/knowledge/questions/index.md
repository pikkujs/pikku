---
type: overview
title: Questions
description: Things asked of the MongoDB stores and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated, so the
doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Should MongoDB secret reads be audited by default?](should-mongodb-secret-reads-be-audited-by-default.md) — The MongoDB secret service leaves auditing off and reads unaudited, creates the audit index only when auditing is on, and records no row for bulk reads
- [Should pikku user sessions expire on their own?](should-pikku-user-sessions-expire-on-their-own.md) — The MongoDB session store has no expiry field and creates no TTL index, so a stored session is readable at any age
<!-- /pikku:knowledge-index -->
