---
"@pikku/core": patch
---

Add optional `uploadHeaders` to `ContentService.getUploadURL` return type, allowing storage backends (e.g. Backblaze B2) to provide required headers for direct uploads.
