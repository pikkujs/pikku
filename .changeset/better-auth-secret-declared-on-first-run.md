---
'@pikku/inspector': patch
---

A fresh project with Better Auth no longer gets PKU951 for `BETTER_AUTH_SECRET` on its first `pikku all`. The secret is declared by the generated `auth-secrets.gen.ts`, which did not exist yet when the first inspection ran.
