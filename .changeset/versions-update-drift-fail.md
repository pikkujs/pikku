---
'@pikku/cli': patch
---

Make `pikku versions update` fail when immutable contract drift is detected (`FUNCTION_VERSION_MODIFIED`) instead of exiting successfully.

This ensures CI can reliably fail on published-version contract modifications and prevents silent success when the manifest is intentionally not updated.
