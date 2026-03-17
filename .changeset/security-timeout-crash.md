---
"@pikku/core": patch
---

Fix timeout middleware to use Promise.race instead of throwing inside setTimeout, which caused uncatchable exceptions that crashed the process.
