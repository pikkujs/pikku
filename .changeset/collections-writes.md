---
'@pikku/cli': patch
---

The generated collection functions gain create, update and delete, each only where `db/collections.ts` enables it. A write needs the collection's read scope and its own, read again from the stored grants on every call, plus the app's checks. Inputs are strict and written column by column, URL columns take only `http` and `https`, an update can name the version it expects, and each change is recorded in the audit log by record and field names, never by value.
