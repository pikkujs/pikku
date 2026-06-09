---
"@pikku/cli": patch
---

fix(fabric-validate): align migration path with local-db.ts (db/sqlite/ at project root, not packages/functions/db/migrations/) and warn when no migration creates the audit table. Document createInvocationAudit + createAuditedKysely in the pikku-services skill.
