---
'@pikku/core': minor
'@pikku/inspector': minor
---

`defineSecret` takes `generate`, a type (`hex`, `base64`, `uuid` or `password`, with an optional `size`) instead of a function. A secret with `generate` is created and replaced by the deployment, so nobody supplies its value. It must also declare a `rotationPeriod`, and `'never'` is the explicit way to generate it once. A generated secret without a `rotationPeriod`, an unknown type or a bad size fails the build. `generate` reaches the secret's meta for deployment targets to act on; this release does not generate or rotate anything yet.
