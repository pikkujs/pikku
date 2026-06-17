---
'@pikku/cli': patch
---

Fix Postgres DB schema codegen for schema-qualified tables so `pikku db migrate`
emits legal flat interface names like `InstitutionsCountry` instead of invalid
dotted identifiers such as `Institutions.country`.
