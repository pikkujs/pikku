---
type: overview
title: collection
description: Rules about what core holds of the collection backend and how its functions are guarded, and why
---

# collection

<!-- pikku:knowledge-index -->

- [Core holds the collection declaration and nothing that runs it](core-holds-the-collection-declaration-and-nothing-that-runs-it.md) — @pikku/core/collections is a data declaration and types; queries are generated into the project
- [An addon's collection is read and written by the addon's handlers](an-addon-collection-is-read-and-written-by-the-addons-handlers.md) — The host generates the guards and no query on the addon's tables
- [A generated collection write reads its grants again](a-collection-write-reads-its-grants-again.md) — Each write and action has a permission that asks the scope service, beside its live scope
- [A collection image is checked when a record takes it](a-collection-image-is-checked-when-a-record-takes-it.md) — The stored file's size, start and end are read through ContentService; it is not decoded

<!-- /pikku:knowledge-index -->
