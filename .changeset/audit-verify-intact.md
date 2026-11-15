---
'@pikku/core': patch
'@pikku/addon-admin': patch
'@pikku/skills': patch
---

Add an optional `AuditService.verify()` for tamper evidence, and surface it as an optional `intact` field on `admin:getAudits`. Absent when the sink does not implement `verify`.
