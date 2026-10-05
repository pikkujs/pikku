---
'@pikku/addon-console': patch
---

addon-console streams a notice when the project's generated meta is regenerated (`streamMetaChanges`), so the console refetches instead of polling.
