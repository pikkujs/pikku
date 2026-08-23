---
'@pikku/core': patch
'@pikku/better-auth': patch
'@pikku/kysely': patch
'@pikku/redis': patch
'@pikku/mongodb': patch
---

Name the missing key when a secret is not found.

Every `SecretService` threw a bare `Requested secret not found`. In a deployed
runtime the stack is minified, so the message was the only evidence there was —
and it identified neither the key nor the service. Each implementation now names
the key it looked for; the better-auth middlewares that skip on an absent secret
match the prefix through one shared predicate instead of the whole string.
