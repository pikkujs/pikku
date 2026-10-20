---
'@pikku/inspector': patch
'@pikku/inspector-go': patch
---

An addon granted `BETTER_AUTH_SECRET` (or an override onto it) no longer fails the first `pikku all` of a clean better-auth project with PKU124 "targets a secret that does not exist. Available secrets: none". The secret is declared by `auth-secrets.gen.ts`, which that first inspection runs before; the addon-grant check now takes the same fallback the secret-usage check already did. A project without `pikkuBetterAuth` still gets PKU124 for that grant.
