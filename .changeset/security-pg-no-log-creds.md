---
"@pikku/kysely-postgres": patch
---

Stop logging database host, port, and name at info level. Replace process.exit(1) with thrown error on connection failure.
