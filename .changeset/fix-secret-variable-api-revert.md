---
"@pikku/core": patch
"@pikku/kysely": patch
"@pikku/kysely-postgres": patch
"@pikku/services-redis": patch
"@pikku/services-mongodb": patch
"@pikku/services-aws": patch
---

Revert getSecretJSON/setSecretJSON and getJSON/setJSON — use generic getSecret<T>/setSecret and get<T>/set instead
