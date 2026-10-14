---
type: overview
title: Questions
description: Things asked of the AWS services and not yet answered
---

# Questions

Something asked and not yet answered. The code makes a choice nobody has stated, so the
doubt is recorded with the current behaviour, not a guessed rationale.

<!-- pikku:knowledge-index -->
- [Should AWS bulk secret reads drop secrets they cannot read?](should-aws-bulk-secret-reads-drop-unreadable-secrets.md) — AWSSecrets.getSecrets omits any key whose read fails for any reason, while the Kysely secret store throws on an unreadable secret and the core decision names only the Kysely, MongoDB and Redis stores
<!-- /pikku:knowledge-index -->
