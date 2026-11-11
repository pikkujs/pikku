---
'@pikku/cli': patch
'@pikku/inspector': patch
---

`pikku db migrate` warns (PKU486 pii, PKU487 secret) about a column named like personal data or a credential that has no `security` annotation. Unannotated columns were already `private` and still are; any explicit `security` ends the warning. See docs/MIGRATION.md.
