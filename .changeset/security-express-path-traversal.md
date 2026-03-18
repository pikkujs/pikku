---
"@pikku/express": patch
---

Add path traversal protection to the reaper file upload endpoint. Upload paths are now validated to stay within the configured upload directory.
