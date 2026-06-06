---
'@pikku/console': patch
---

Unify the page header across every console page. `ListPageHeader` now renders one canonical structure — title row, subtitle, then a dedicated full-width wrapping actions row — and pins the title color so it no longer inherits a wrapper's `color`, rendering identically on OSS and host-embedded pages. Export the layout primitives (`PageContainer`, `PageHeader`, `ListPageHeader`, `PageHeaderControls`, `PageToolbar`) from the package entry so host apps can build on the same components.
