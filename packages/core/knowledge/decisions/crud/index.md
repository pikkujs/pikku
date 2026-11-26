---
type: overview
title: CRUD
description: Rules about what core holds of the CRUD backend and how its functions are guarded, and why
---

# CRUD

<!-- pikku:knowledge-index -->

- [Core holds the CRUD declaration and nothing that runs it](core-holds-the-crud-declaration-and-nothing-that-runs-it.md) — @pikku/core/crud is a data declaration and types; queries are generated into the project
- [An addon's CRUD collection is read and written by the addon's handlers](an-addon-collection-is-read-and-written-by-the-addons-handlers.md) — The host generates the guards and no query on the addon's tables
- [A generated CRUD write reads its grants again](a-crud-write-reads-its-grants-again.md) — Each write and action has a permission that asks the scope service, beside its live scope
- [A CRUD image is checked when a record takes it](a-crud-image-is-checked-when-a-record-takes-it.md) — The stored file's size, start and end are read through ContentService; it is not decoded

<!-- /pikku:knowledge-index -->
