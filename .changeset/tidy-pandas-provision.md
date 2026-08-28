---
'@pikku/better-auth': patch
'@pikku/cli': patch
---

Persona provisioning actually provisions.

Two things stopped `provisionPersonas` from ever creating an account. It read
`$context` off the better-auth instance without awaiting it — every other call
site does — so the orphan sweep died on `undefined.findMany`, and a cast to
`any` kept the compiler quiet about it. And nothing set `PIKKU_ENV`, so the
environment rule failed closed and skipped every persona before it got that
far; `pikku dev` now names the local environment from `environments` in
pikku.config.json, preferring one called `local`.
