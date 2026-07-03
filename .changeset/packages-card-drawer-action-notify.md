---
'@pikku/console': patch
---

Addon/API cards in the gallery no longer carry their own Add/Import button — the action lives only in the detail drawer now (the card just shows an "Added"/"Imported" badge once installed, and click-to-open otherwise). Install and OpenAPI-import mutations now surface a notification on both success and failure instead of failing silently.
