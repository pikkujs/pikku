---
"@pikku/mongodb": patch
---

Replace process.exit(1) with thrown error on MongoDB connection failure to allow graceful error handling.
