---
'@pikku/core': minor
'@pikku/inspector': minor
---

`defineSecret` takes `generate: { size }`, the number of random bytes (at least 16) a deployment creates for the value, hex encoded. A secret with `generate` is created and replaced by the deployment, so nobody supplies its value. It must also declare a `rotationPeriod`, and `'never'` is the explicit way to generate it once. A generated secret without a `rotationPeriod`, or with a missing or too small size, fails the build. `generate` reaches the secret's meta for deployment targets to act on; this release does not generate or rotate anything yet.
