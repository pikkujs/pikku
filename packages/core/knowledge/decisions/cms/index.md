---
type: overview
title: CMS
description: Rules about what core holds of the CMS and how its functions are guarded, and why
---

# CMS

<!-- pikku:knowledge-index -->
- [Core holds the CMS declaration and nothing that runs it](core-holds-the-cms-declaration-and-nothing-that-runs-it.md) — @pikku/core/cms is a data declaration and types; queries are generated into the project
- [An addon's CMS collection is read and written by the addon's handlers](an-addon-collection-is-read-and-written-by-the-addons-handlers.md) — The host generates the guards and no query on the addon's tables
- [A generated CMS write reads its grants again](a-cms-write-reads-its-grants-again.md) — Each write and action has a permission that asks the scope service, beside its live scope
- [A CMS image is checked when a record takes it](a-cms-image-is-checked-when-a-record-takes-it.md) — The stored file's size, start and end are read through ContentService; it is not decoded
<!-- /pikku:knowledge-index -->
